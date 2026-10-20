// LNCrawler plugin for LNReader.
// Site: https://lncrawler.monster — a React SPA over a public JSON API at
// https://api.lncrawler.monster. The catalog aggregates novels from many
// source sites and languages (5,993 novels; ~4,907 with English sources);
// this plugin reads the English source of each novel.
// Catalog/search: /novels/search/?language=en (the search endpoint is the
// only listing with a language filter). Novel: /novels/<slug>/ lists all
// sources; details and chapters come from the chosen source's endpoints.
//
import {
  chooseSource,
  parseChapterBody,
  parseChaptersPage,
  parseNovelListPage,
  parseNovelSources,
  parseSourceDetails,
} from './parsers';
import type { Plugin } from './lnreader-api';

// The host app injects these via `require`, but their exact shape has varied
// across app versions, so resolve them defensively at load with fallbacks.
declare function require(name: string): any;

function loadFetchLib(): {
  fetchText?: (url: string) => Promise<string>;
  fetchApi?: (url: string) => Promise<{ text: () => Promise<string> }>;
} {
  try {
    return require('@libs/fetch') || {};
  } catch (e) {
    return {};
  }
}

function loadNovelStatus(): Record<string, string> {
  try {
    const lib = require('@libs/novelStatus');
    if (lib && lib.NovelStatus) return lib.NovelStatus;
  } catch (e) {
    // fall through to the built-in copy below
  }
  // Built-in copy of the NovelStatus string enum, so the plugin keeps
  // working even if the host does not provide @libs/novelStatus.
  return {
    Unknown: 'Unknown',
    Ongoing: 'Ongoing',
    Completed: 'Completed',
    Licensed: 'Licensed',
    PublishingFinished: 'Publishing Finished',
    Cancelled: 'Cancelled',
    OnHiatus: 'On Hiatus',
  };
}

const fetchLib = loadFetchLib();
const NovelStatus = loadNovelStatus();

// --- Resilient fetching -------------------------------------------------
// Chapter downloads are one HTTP request per chapter, so a single flaky
// request used to fail the whole chapter. This wrapper adds a timeout and
// retries transient failures with exponential backoff. It never fires
// parallel requests and never retries definite client errors, so the site
// is treated respectfully.
const FETCH_TIMEOUT_MS = 30000;
const MAX_FETCH_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => {
    if (typeof setTimeout === 'function') setTimeout(resolve, ms);
    else resolve();
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: any = undefined;
  const timeout = new Promise<T>((_, reject) => {
    if (typeof setTimeout === 'function') {
      timer = setTimeout(() => reject(new Error('Request timed out')), ms);
    }
  });
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
  };
  return Promise.race([p, timeout]).then(
    v => {
      clear();
      return v;
    },
    e => {
      clear();
      throw e;
    },
  );
}

interface RawFetchResult {
  status?: number;
  text: string;
}

async function fetchRaw(url: string): Promise<RawFetchResult> {
  if (typeof fetchLib.fetchApi === 'function') {
    const res: any = await fetchLib.fetchApi(url);
    const status =
      res && typeof res.status === 'number' ? res.status : undefined;
    const text =
      res && typeof res.text === 'function' ? await res.text() : '';
    return { status, text };
  }
  if (typeof fetchLib.fetchText === 'function') {
    return { text: await fetchLib.fetchText(url) };
  }
  throw new Error('No fetch implementation provided by the host app');
}

/** Pull an HTTP status out of errors like "HTTP 503". */
function statusFromError(e: any): number | undefined {
  const m = /HTTP (\d{3})/.exec(String((e && e.message) || e || ''));
  return m ? parseInt(m[1], 10) : undefined;
}

async function fetchText(url: string): Promise<string> {
  let lastError: any = new Error('Request failed');
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    let status: number | undefined;
    try {
      const res = await withTimeout(fetchRaw(url), FETCH_TIMEOUT_MS);
      status = res.status;
      if (status === 429 || (status !== undefined && status >= 500)) {
        throw new Error('Server responded with HTTP ' + status);
      }
      return res.text;
    } catch (e) {
      lastError = e;
      if (status === undefined) status = statusFromError(e);
      const msg = String((e && (e as Error).message) || e || '');
      const retryable =
        status === undefined ||
        status === 429 ||
        status >= 500 ||
        /timed out|timeout|Network|network|fetch failed/i.test(msg);
      if (!retryable || attempt === MAX_FETCH_ATTEMPTS) throw lastError;
      await sleep(1000 * Math.pow(2, attempt - 1)); // 1s, then 2s
    }
  }
  throw lastError;
}

// --- Plugin -------------------------------------------------------------

const API = 'https://api.lncrawler.monster';
const PAGE_SIZE = 20;
// Safety bound for the chapter-list page loop (100 chapters per page).
const MAX_CHAPTER_PAGES = 500;

class LNCrawlerPlugin implements Plugin.PluginBase {
  id = 'lncrawler';
  name = 'LNCrawler';
  icon = 'src/en/lncrawler/icon.png';
  site = 'https://lncrawler.monster';
  version = '1.0.2';

  async popularNovels(
    pageNo: number,
    _options: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    // The API exposes no sort options; its default order is the site's
    // own browse order. The Latest toggle lands here too.
    const text = await fetchText(
      `${API}/novels/search/?language=en&page=${pageNo}&page_size=${PAGE_SIZE}`,
    );
    const page = parseNovelListPage(text);
    // The API clamps out-of-range pages to the last page; without this
    // guard the app would keep paging and re-show the last page forever.
    return pageNo > page.totalPages ? [] : page.cards;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.replace(/^\/novels\//, '').replace(/\/+$/, '');
    const detailText = await fetchText(
      `${API}/novels/${encodeURIComponent(slug)}/`,
    );
    const detail = parseNovelSources(detailText);
    if (!detail.name) {
      throw new Error('Could not load the novel ' + novelPath);
    }
    const source = chooseSource(detail);
    const base = `${API}/novels/${encodeURIComponent(slug)}/${encodeURIComponent(source.slug)}`;
    const details = parseSourceDetails(await fetchText(base + '/'));
    // Chapter list is paginated at 100/page; fetch every page in order.
    const first = parseChaptersPage(await fetchText(base + '/chapters/'));
    const entries = first.entries.slice();
    const pages = Math.min(first.totalPages, MAX_CHAPTER_PAGES);
    for (let page = 2; page <= pages; page++) {
      const next = parseChaptersPage(
        await fetchText(`${base}/chapters/?page=${page}`),
      );
      for (const e of next.entries) entries.push(e);
    }
    entries.sort((a, b) => a.id - b.id);
    const chapters: Plugin.ChapterItem[] = entries.map(e => ({
      name: e.title,
      path: `${slug}/${source.slug}/${e.id}`,
      chapterNumber: e.id,
    }));
    const status =
      details.statusRaw === 'Completed'
        ? NovelStatus.Completed
        : details.statusRaw === 'Ongoing'
          ? NovelStatus.Ongoing
          : details.statusRaw === 'On Hiatus'
            ? NovelStatus.OnHiatus
            : details.statusRaw === 'Cancelled'
              ? NovelStatus.Cancelled
              : NovelStatus.Unknown;
    return {
      path: novelPath,
      name: detail.name,
      cover: details.cover || undefined,
      summary: details.summary,
      author: details.author,
      genres: details.genres,
      status,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const parts = chapterPath.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length !== 3) {
      throw new Error('Unexpected chapter path: ' + chapterPath);
    }
    const url =
      `${API}/novels/${encodeURIComponent(parts[0])}` +
      `/${encodeURIComponent(parts[1])}/chapter/${encodeURIComponent(parts[2])}/`;
    const content = parseChapterBody(await fetchText(url));
    if (!content) {
      throw new Error('Chapter content not found');
    }
    return content;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const text = await fetchText(
      `${API}/novels/search/?query=${encodeURIComponent(searchTerm)}&language=en&page=${pageNo}&page_size=${PAGE_SIZE}`,
    );
    const page = parseNovelListPage(text);
    return pageNo > page.totalPages ? [] : page.cards;
  }

  resolveUrl = (path: string, _isNovel?: boolean) =>
    /^https?:\/\//i.test(path) ? path : `${this.site}/novels/${path}`;
}

export default new LNCrawlerPlugin();
