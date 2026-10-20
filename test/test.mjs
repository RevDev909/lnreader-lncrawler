// Live parser tests for the LNCrawler plugin.
// Runs against the real API; every check must pass.
import {
  chooseSource,
  parseChapterBody,
  parseChaptersPage,
  parseNovelCards,
  parseNovelListPage,
  parseNovelSources,
  parseSourceDetails,
  sanitizeChapterHtml,
} from './parsers.bundle.mjs';

const API = 'https://api.lncrawler.monster';
let failures = 0;

function check(label, ok, extra) {
  if (ok) {
    console.log('  PASS', label);
  } else {
    failures++;
    console.log('  FAIL', label, extra !== undefined ? '-> ' + extra : '');
  }
}

async function get(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
    },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  return res.text();
}

console.log('catalog (English, page 1):');
{
  const cards = parseNovelCards(
    await get(`${API}/novels/search/?language=en&page=1&page_size=20`),
  );
  check('20 cards', cards.length === 20, cards.length);
  check(
    'all cards have name and slug path',
    cards.every(c => c.name && c.path),
  );
  check(
    'almost all cards have a cover (a few sources have none)',
    cards.filter(c => c.cover).length >= 15,
    cards.filter(c => c.cover).length,
  );
  const beyond = parseNovelListPage(
    await get(`${API}/novels/search/?language=en&page=9999&page_size=20`),
  );
  check(
    'past-end page is clamped (plugin guards on totalPages)',
    beyond.currentPage === beyond.totalPages && beyond.totalPages < 9999,
    beyond.currentPage + '/' + beyond.totalPages,
  );
}

console.log('search:');
{
  const cards = parseNovelCards(
    await get(
      `${API}/novels/search/?query=${encodeURIComponent('shadow slave')}&language=en&page=1&page_size=20`,
    ),
  );
  check('finds Shadow Slave', cards.some(c => c.path === 'shadow-slave'));
}

console.log('novel sources (Shadow Slave):');
let chosen;
{
  const detail = parseNovelSources(await get(`${API}/novels/shadow-slave/`));
  check('name parsed', detail.name === 'Shadow Slave', detail.name);
  check('multiple sources', detail.sources.length >= 5, detail.sources.length);
  chosen = chooseSource(detail);
  check('chosen source is English', chosen.language === 'en', chosen.slug);
  check(
    'chosen source has 3000+ chapters',
    chosen.available >= 3000,
    chosen.available,
  );
}

console.log('source details:');
{
  const d = parseSourceDetails(
    await get(`${API}/novels/shadow-slave/${chosen.slug}/`),
  );
  check('synopsis mentions poverty', !!d.summary && /poverty/.test(d.summary));
  check('author is Guiltythree', d.author === 'Guiltythree', d.author);
  check('genres include Action', !!d.genres && /Action/.test(d.genres));
  check('cover is a URL', !!d.cover && d.cover.startsWith('http'));
}

console.log('chapter list:');
{
  const page = parseChaptersPage(
    await get(`${API}/novels/shadow-slave/${chosen.slug}/chapters/`),
  );
  check('count is 3000+', page.count >= 3000, page.count);
  check('100 entries on page 1', page.entries.length === 100, page.entries.length);
  check('first chapter id is 1', page.entries[0].id === 1);
  check(
    'totalPages matches count',
    page.totalPages === Math.ceil(page.count / 100),
    page.totalPages,
  );
  const last = parseChaptersPage(
    await get(
      `${API}/novels/shadow-slave/${chosen.slug}/chapters/?page=${page.totalPages}`,
    ),
  );
  check('last page non-empty', last.entries.length > 0, last.entries.length);
  check(
    'last chapter id equals count',
    last.entries[last.entries.length - 1].id === page.count,
    last.entries[last.entries.length - 1].id,
  );
}

console.log('chapter body (chapter 1):');
{
  const body = parseChapterBody(
    await get(`${API}/novels/shadow-slave/${chosen.slug}/chapter/1/`),
  );
  check('body long', body.length > 5000, body.length);
  check('has story text', /frail-looking young man/.test(body));
  check('leading <h1> stripped', !/^\s*<h1/.test(body));
}

console.log('sanitizer:');
{
  const dirty =
    '<p onclick="evil()">text</p><script>alert(1)</script>' +
    '<iframe src="https://x"></iframe><form><input></form>' +
    '<a href="javascript:evil()">link</a>' +
    '<img src="https://img/x.jpg" onerror="evil()">' +
    '<p>clean</p>';
  const clean = sanitizeChapterHtml(dirty);
  check('story text kept', /text/.test(clean) && /clean/.test(clean));
  check('script removed', !/<script/.test(clean));
  check('iframe removed', !/<iframe/.test(clean));
  check('form removed', !/<form/.test(clean));
  check('event handlers removed', !/onclick|onerror/.test(clean));
  check('javascript: URL removed', !/javascript:/.test(clean));
  check('safe img kept', /<img src="https:\/\/img\/x.jpg">/.test(clean));
}

console.log('shape validation:');
{
  let threw = false;
  try {
    parseChaptersPage('{"detail":"Not found"}');
  } catch (e) {
    threw = /unexpected shape/.test(e.message);
  }
  check('error payload throws instead of empty list', threw);
  threw = false;
  try {
    parseNovelCards('{"error":"boom"}');
  } catch (e) {
    threw = /unexpected shape/.test(e.message);
  }
  check('bad list payload throws', threw);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
