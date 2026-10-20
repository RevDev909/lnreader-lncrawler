// LNCrawler parsers — pure functions over the site's JSON API responses.
// The web frontend (lncrawler.monster) is a React SPA; all data comes from
// https://api.lncrawler.monster:
//   GET /novels/search/?query=&language=en&page=N&page_size=20
//       catalog + search (the plain /novels/ list has no language filter;
//       the search endpoint doubles as the catalog — language=en narrows
//       the 5,993-novel catalog to the ~4,907 with English sources).
//   GET /novels/<slug>/                  novel + all of its sources
//   GET /novels/<slug>/<source>/         per-source details (synopsis etc.)
//   GET /novels/<slug>/<source>/chapters/?page=N   paginated, 100/page
//   GET /novels/<slug>/<source>/chapter/<id>/       chapter body HTML
//
// A novel aggregates several source sites (and languages). The plugin is
// an English source, so parseNovel picks the English source with the most
// available chapters and reads everything through it.
//
// Defensive cap so a corrupt or hostile response cannot make the app
// buffer unbounded data (chapter bodies here are JSON strings).
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function checkSize(text: string): void {
  if (text && text.length > MAX_RESPONSE_BYTES) {
    throw new Error('Response too large (' + text.length + ' bytes)');
  }
}

function parseJson(text: string, what: string): any {
  checkSize(text);
  let data: any;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(what + ' response was not valid JSON');
  }
  if (!data || typeof data !== 'object') {
    throw new Error(what + ' response had an unexpected shape');
  }
  return data;
}

/** Strip tags and collapse whitespace (for the HTML synopsis). */
export function stripHtml(html: string): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export interface NovelCard {
  name: string;
  /** The novel slug — parseNovel resolves the best English source. */
  path: string;
  cover?: string;
}

function cardFrom(entry: any): NovelCard | null {
  if (!entry || typeof entry.slug !== 'string' || !entry.slug) return null;
  const src = entry.prefered_source || {};
  return {
    name: String(entry.title || entry.slug),
    path: entry.slug,
    cover:
      typeof src.cover_min_url === 'string' && src.cover_min_url
        ? src.cover_min_url
        : undefined,
  };
}

/** Results page of /novels/search/ (also used as the catalog listing). */
export function parseNovelCards(text: string): NovelCard[] {
  return parseNovelListPage(text).cards;
}

export interface NovelListPage {
  cards: NovelCard[];
  totalPages: number;
  currentPage: number;
}

/**
 * The list response with its paging metadata. The API CLAMPS an
 * out-of-range page to the last page instead of returning an empty one,
 * so callers must compare the requested page against totalPages —
 * otherwise the app would re-show the last page forever.
 */
export function parseNovelListPage(text: string): NovelListPage {
  const data = parseJson(text, 'Novel list');
  if (!Array.isArray(data.results)) {
    // An error payload or a changed shape must surface as a failure,
    // not as an empty catalog page.
    throw new Error('Novel list response had an unexpected shape');
  }
  const cards: NovelCard[] = [];
  for (const entry of data.results) {
    const card = cardFrom(entry);
    if (card) cards.push(card);
  }
  return {
    cards,
    totalPages: typeof data.total_pages === 'number' ? data.total_pages : 1,
    currentPage:
      typeof data.current_page === 'number' ? data.current_page : 1,
  };
}

export interface SourceOption {
  slug: string;
  language: string;
  available: number;
}

export interface NovelSources {
  name: string;
  sources: SourceOption[];
  preferredSlug?: string;
}

/** GET /novels/<slug>/ — the novel and every source it aggregates. */
export function parseNovelSources(text: string): NovelSources {
  const data = parseJson(text, 'Novel');
  if (!Array.isArray(data.sources)) {
    throw new Error('Novel response had an unexpected shape');
  }
  const sources: SourceOption[] = [];
  for (const s of data.sources) {
    if (!s || typeof s.source_slug !== 'string' || !s.source_slug) continue;
    sources.push({
      slug: s.source_slug,
      language: typeof s.language === 'string' ? s.language : '',
      available:
        typeof s.available_chapters_count === 'number'
          ? s.available_chapters_count
          : 0,
    });
  }
  const pref = data.prefered_source || {};
  return {
    name: String(data.title || ''),
    sources,
    preferredSlug:
      typeof pref.source_slug === 'string' ? pref.source_slug : undefined,
  };
}

/**
 * Pick the source the plugin reads through: the English source with the
 * most available chapters (the site's preferred source wins ties when it
 * is English). Falls back to the largest source overall when the novel
 * has no English source, so the novel still opens.
 */
export function chooseSource(detail: NovelSources): SourceOption {
  let bestEn: SourceOption | undefined;
  let bestAny: SourceOption | undefined;
  for (const s of detail.sources) {
    if (s.available <= 0) continue;
    if (!bestAny || s.available > bestAny.available) bestAny = s;
    if (s.language === 'en') {
      if (
        !bestEn ||
        s.available > bestEn.available ||
        (s.available === bestEn.available && s.slug === detail.preferredSlug)
      ) {
        bestEn = s;
      }
    }
  }
  const chosen = bestEn || bestAny;
  if (!chosen) {
    throw new Error('This novel has no readable source on LNCrawler');
  }
  return chosen;
}

export interface SourceDetails {
  summary?: string;
  author?: string;
  genres?: string;
  /** Raw site status: Ongoing | Completed | On Hiatus | Cancelled | Unknown. */
  statusRaw: string;
  cover?: string;
}

/** GET /novels/<slug>/<source>/ — per-source metadata. */
export function parseSourceDetails(text: string): SourceDetails {
  const data = parseJson(text, 'Novel details');
  const summary = data.synopsis ? stripHtml(String(data.synopsis)) : '';
  const authors: string[] = Array.isArray(data.authors)
    ? data.authors.filter((a: any) => typeof a === 'string' && a)
    : [];
  const tags: string[] = Array.isArray(data.tags)
    ? data.tags.filter((t: any) => typeof t === 'string' && t)
    : [];
  return {
    summary: summary || undefined,
    author: authors.length ? authors.join(', ') : undefined,
    genres: tags.length ? tags.join(', ') : undefined,
    statusRaw: typeof data.status === 'string' ? data.status : '',
    cover:
      typeof data.cover_url === 'string' && data.cover_url
        ? data.cover_url
        : undefined,
  };
}

export interface ChapterEntry {
  id: number;
  title: string;
}

export interface ChaptersPage {
  count: number;
  totalPages: number;
  entries: ChapterEntry[];
}

/** One page of GET .../chapters/ — only chapters that carry content. */
export function parseChaptersPage(text: string): ChaptersPage {
  const data = parseJson(text, 'Chapter list');
  if (!Array.isArray(data.chapters)) {
    throw new Error('Chapter list response had an unexpected shape');
  }
  const entries: ChapterEntry[] = [];
  for (const c of data.chapters) {
    if (!c || c.has_content !== true) continue;
    if (typeof c.chapter_id !== 'number') continue;
    entries.push({
      id: c.chapter_id,
      title: String(c.title || 'Chapter ' + c.chapter_id),
    });
  }
  return {
    count: typeof data.count === 'number' ? data.count : entries.length,
    totalPages:
      typeof data.total_pages === 'number' ? data.total_pages : 1,
    entries,
  };
}

/**
 * Chapter body HTML from GET .../chapter/<id>/. The API prefixes the body
 * with an <h1> of the chapter title — the app already shows the title, so
 * the heading is dropped.
 */
export function parseChapterBody(text: string): string {
  const data = parseJson(text, 'Chapter');
  if (typeof data.body !== 'string') {
    throw new Error('Chapter response had an unexpected shape');
  }
  return data.body.replace(/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>\s*/i, '').trim();
}
