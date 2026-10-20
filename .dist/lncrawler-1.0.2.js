"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = function(cb, mod) {
  return function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
};

// .tsc-build/parsers.js
var require_parsers = __commonJS({
  ".tsc-build/parsers.js": function(exports2) {
    "use strict";
    var __values2 = exports2 && exports2.__values || function(o) {
      var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
      if (m) return m.call(o);
      if (o && typeof o.length === "number") return {
        next: function() {
          if (o && i >= o.length) o = void 0;
          return { value: o && o[i++], done: !o };
        }
      };
      throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.stripHtml = stripHtml;
    exports2.sanitizeChapterHtml = sanitizeChapterHtml;
    exports2.parseNovelCards = parseNovelCards;
    exports2.parseNovelListPage = parseNovelListPage;
    exports2.parseNovelSources = parseNovelSources;
    exports2.chooseSource = chooseSource;
    exports2.parseSourceDetails = parseSourceDetails;
    exports2.parseChaptersPage = parseChaptersPage;
    exports2.parseChapterBody = parseChapterBody;
    var MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
    function checkSize(text) {
      if (text && text.length > MAX_RESPONSE_BYTES) {
        throw new Error("Response too large (" + text.length + " bytes)");
      }
    }
    function parseJson(text, what) {
      checkSize(text);
      var data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(what + " response was not valid JSON");
      }
      if (!data || typeof data !== "object") {
        throw new Error(what + " response had an unexpected shape");
      }
      return data;
    }
    function stripHtml(html) {
      return String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
    }
    function sanitizeChapterHtml(html) {
      return html.replace(/<(script|style|iframe|object|embed|form)\b[\s\S]*?<\/\1\s*>/gi, "").replace(/<(script|style|iframe|object|embed|form|link|meta|base)\b[^>]*>/gi, "").replace(/\son\w+\s*=\s*"[^"]*"/gi, "").replace(/\son\w+\s*=\s*'[^']*'/gi, "").replace(/\son\w+\s*=\s*[^\s>]+/gi, "").replace(/\s(?:href|src)\s*=\s*"\s*(?:javascript|vbscript)\s*:[^"]*"/gi, "").replace(/\s(?:href|src)\s*=\s*'\s*(?:javascript|vbscript)\s*:[^']*'/gi, "").replace(/\s(?:href|src)\s*=\s*"\s*data\s*:\s*text\/html[^"]*"/gi, "").replace(/\s(?:href|src)\s*=\s*'\s*data\s*:\s*text\/html[^']*'/gi, "");
    }
    function cardFrom(entry) {
      if (!entry || typeof entry.slug !== "string" || !entry.slug)
        return null;
      var src = entry.prefered_source || {};
      return {
        name: String(entry.title || entry.slug),
        path: entry.slug,
        cover: typeof src.cover_min_url === "string" && src.cover_min_url ? src.cover_min_url : void 0
      };
    }
    function parseNovelCards(text) {
      return parseNovelListPage(text).cards;
    }
    function parseNovelListPage(text) {
      var e_1, _a;
      var data = parseJson(text, "Novel list");
      if (!Array.isArray(data.results)) {
        throw new Error("Novel list response had an unexpected shape");
      }
      var cards = [];
      try {
        for (var _b = __values2(data.results), _c = _b.next(); !_c.done; _c = _b.next()) {
          var entry = _c.value;
          var card = cardFrom(entry);
          if (card)
            cards.push(card);
        }
      } catch (e_1_1) {
        e_1 = { error: e_1_1 };
      } finally {
        try {
          if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        } finally {
          if (e_1) throw e_1.error;
        }
      }
      return {
        cards: cards,
        totalPages: typeof data.total_pages === "number" ? data.total_pages : 1,
        currentPage: typeof data.current_page === "number" ? data.current_page : 1
      };
    }
    function parseNovelSources(text) {
      var e_2, _a;
      var data = parseJson(text, "Novel");
      if (!Array.isArray(data.sources)) {
        throw new Error("Novel response had an unexpected shape");
      }
      var sources = [];
      try {
        for (var _b = __values2(data.sources), _c = _b.next(); !_c.done; _c = _b.next()) {
          var s = _c.value;
          if (!s || typeof s.source_slug !== "string" || !s.source_slug)
            continue;
          sources.push({
            slug: s.source_slug,
            language: typeof s.language === "string" ? s.language : "",
            available: typeof s.available_chapters_count === "number" ? s.available_chapters_count : 0
          });
        }
      } catch (e_2_1) {
        e_2 = { error: e_2_1 };
      } finally {
        try {
          if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        } finally {
          if (e_2) throw e_2.error;
        }
      }
      var pref = data.prefered_source || {};
      return {
        name: String(data.title || ""),
        sources: sources,
        preferredSlug: typeof pref.source_slug === "string" ? pref.source_slug : void 0
      };
    }
    function chooseSource(detail) {
      var e_3, _a;
      var bestEn;
      var bestAny;
      try {
        for (var _b = __values2(detail.sources), _c = _b.next(); !_c.done; _c = _b.next()) {
          var s = _c.value;
          if (s.available <= 0)
            continue;
          if (!bestAny || s.available > bestAny.available)
            bestAny = s;
          if (s.language === "en") {
            if (!bestEn || s.available > bestEn.available || s.available === bestEn.available && s.slug === detail.preferredSlug) {
              bestEn = s;
            }
          }
        }
      } catch (e_3_1) {
        e_3 = { error: e_3_1 };
      } finally {
        try {
          if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        } finally {
          if (e_3) throw e_3.error;
        }
      }
      var chosen = bestEn || bestAny;
      if (!chosen) {
        throw new Error("This novel has no readable source on LNCrawler");
      }
      return chosen;
    }
    function parseSourceDetails(text) {
      var data = parseJson(text, "Novel details");
      var summary = data.synopsis ? stripHtml(String(data.synopsis)) : "";
      var authors = Array.isArray(data.authors) ? data.authors.filter(function(a) {
        return typeof a === "string" && a;
      }) : [];
      var tags = Array.isArray(data.tags) ? data.tags.filter(function(t) {
        return typeof t === "string" && t;
      }) : [];
      return {
        summary: summary || void 0,
        author: authors.length ? authors.join(", ") : void 0,
        genres: tags.length ? tags.join(", ") : void 0,
        statusRaw: typeof data.status === "string" ? data.status : "",
        cover: typeof data.cover_url === "string" && data.cover_url ? data.cover_url : void 0
      };
    }
    function parseChaptersPage(text) {
      var e_4, _a;
      var data = parseJson(text, "Chapter list");
      if (!Array.isArray(data.chapters)) {
        throw new Error("Chapter list response had an unexpected shape");
      }
      var entries = [];
      try {
        for (var _b = __values2(data.chapters), _c = _b.next(); !_c.done; _c = _b.next()) {
          var c = _c.value;
          if (!c || c.has_content !== true)
            continue;
          if (typeof c.chapter_id !== "number")
            continue;
          entries.push({
            id: c.chapter_id,
            title: String(c.title || "Chapter " + c.chapter_id)
          });
        }
      } catch (e_4_1) {
        e_4 = { error: e_4_1 };
      } finally {
        try {
          if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        } finally {
          if (e_4) throw e_4.error;
        }
      }
      return {
        count: typeof data.count === "number" ? data.count : entries.length,
        totalPages: typeof data.total_pages === "number" ? data.total_pages : 1,
        entries: entries
      };
    }
    function parseChapterBody(text) {
      var data = parseJson(text, "Chapter");
      if (typeof data.body !== "string") {
        throw new Error("Chapter response had an unexpected shape");
      }
      var withoutTitle = data.body.replace(/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>\s*/i, "").trim();
      return sanitizeChapterHtml(withoutTitle);
    }
  }
});

// .tsc-build/plugin.js
var __awaiter = exports && exports.__awaiter || function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator = exports && exports.__generator || function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var __values = exports && exports.__values || function(o) {
  var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
  if (m) return m.call(o);
  if (o && typeof o.length === "number") return {
    next: function() {
      if (o && i >= o.length) o = void 0;
      return { value: o && o[i++], done: !o };
    }
  };
  throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(exports, "__esModule", { value: true });
var parsers_1 = require_parsers();
function loadFetchLib() {
  try {
    return require("@libs/fetch") || {};
  } catch (e) {
    return {};
  }
}
function loadNovelStatus() {
  try {
    var lib = require("@libs/novelStatus");
    if (lib && lib.NovelStatus)
      return lib.NovelStatus;
  } catch (e) {
  }
  return {
    Unknown: "Unknown",
    Ongoing: "Ongoing",
    Completed: "Completed",
    Licensed: "Licensed",
    PublishingFinished: "Publishing Finished",
    Cancelled: "Cancelled",
    OnHiatus: "On Hiatus"
  };
}
var fetchLib = loadFetchLib();
var NovelStatus = loadNovelStatus();
var FETCH_TIMEOUT_MS = 3e4;
var MAX_FETCH_ATTEMPTS = 3;
function sleep(ms) {
  return new Promise(function(resolve) {
    if (typeof setTimeout === "function")
      setTimeout(resolve, ms);
    else
      resolve();
  });
}
function withTimeout(p, ms) {
  var timer = void 0;
  var timeout = new Promise(function(_, reject) {
    if (typeof setTimeout === "function") {
      timer = setTimeout(function() {
        return reject(new Error("Request timed out"));
      }, ms);
    }
  });
  var clear = function() {
    if (timer !== void 0)
      clearTimeout(timer);
  };
  return Promise.race([p, timeout]).then(function(v) {
    clear();
    return v;
  }, function(e) {
    clear();
    throw e;
  });
}
function fetchRaw(url) {
  return __awaiter(this, void 0, void 0, function() {
    var res, status_1, text, _a;
    var _b;
    return __generator(this, function(_c) {
      switch (_c.label) {
        case 0:
          if (!(typeof fetchLib.fetchApi === "function")) return [3, 5];
          return [4, fetchLib.fetchApi(url)];
        case 1:
          res = _c.sent();
          status_1 = res && typeof res.status === "number" ? res.status : void 0;
          if (!(res && typeof res.text === "function")) return [3, 3];
          return [4, res.text()];
        case 2:
          _a = _c.sent();
          return [3, 4];
        case 3:
          _a = "";
          _c.label = 4;
        case 4:
          text = _a;
          return [2, { status: status_1, text: text }];
        case 5:
          if (!(typeof fetchLib.fetchText === "function")) return [3, 7];
          _b = {};
          return [4, fetchLib.fetchText(url)];
        case 6:
          return [2, (_b.text = _c.sent(), _b)];
        case 7:
          throw new Error("No fetch implementation provided by the host app");
      }
    });
  });
}
function statusFromError(e) {
  var m = /HTTP (\d{3})/.exec(String(e && e.message || e || ""));
  return m ? parseInt(m[1], 10) : void 0;
}
function fetchText(url) {
  return __awaiter(this, void 0, void 0, function() {
    var lastError, attempt, status_2, res, e_1, msg, retryable;
    return __generator(this, function(_a) {
      switch (_a.label) {
        case 0:
          lastError = new Error("Request failed");
          attempt = 1;
          _a.label = 1;
        case 1:
          if (!(attempt <= MAX_FETCH_ATTEMPTS)) return [3, 7];
          status_2 = void 0;
          _a.label = 2;
        case 2:
          _a.trys.push([2, 4, , 6]);
          return [4, withTimeout(fetchRaw(url), FETCH_TIMEOUT_MS)];
        case 3:
          res = _a.sent();
          status_2 = res.status;
          if (status_2 === 429 || status_2 !== void 0 && status_2 >= 500) {
            throw new Error("Server responded with HTTP " + status_2);
          }
          return [2, res.text];
        case 4:
          e_1 = _a.sent();
          lastError = e_1;
          if (status_2 === void 0)
            status_2 = statusFromError(e_1);
          msg = String(e_1 && e_1.message || e_1 || "");
          retryable = status_2 === void 0 || status_2 === 429 || status_2 >= 500 || /timed out|timeout|Network|network|fetch failed/i.test(msg);
          if (!retryable || attempt === MAX_FETCH_ATTEMPTS)
            throw lastError;
          return [4, sleep(1e3 * Math.pow(2, attempt - 1))];
        case 5:
          _a.sent();
          return [3, 6];
        case 6:
          attempt++;
          return [3, 1];
        case 7:
          throw lastError;
      }
    });
  });
}
var API = "https://api.lncrawler.monster";
var PAGE_SIZE = 20;
var MAX_CHAPTER_PAGES = 500;
var LNCrawlerPlugin = (
  /** @class */
  (function() {
    function LNCrawlerPlugin2() {
      var _this = this;
      this.id = "lncrawler";
      this.name = "LNCrawler";
      this.icon = "src/en/lncrawler/icon.png";
      this.site = "https://lncrawler.monster";
      this.version = "1.0.2";
      this.resolveUrl = function(path, _isNovel) {
        return /^https?:\/\//i.test(path) ? path : "".concat(_this.site, "/novels/").concat(path);
      };
    }
    LNCrawlerPlugin2.prototype.popularNovels = function(pageNo, _options) {
      return __awaiter(this, void 0, void 0, function() {
        var text, page;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, fetchText("".concat(API, "/novels/search/?language=en&page=").concat(pageNo, "&page_size=").concat(PAGE_SIZE))];
            case 1:
              text = _a.sent();
              page = (0, parsers_1.parseNovelListPage)(text);
              return [2, pageNo > page.totalPages ? [] : page.cards];
          }
        });
      });
    };
    LNCrawlerPlugin2.prototype.parseNovel = function(novelPath) {
      return __awaiter(this, void 0, void 0, function() {
        var slug, detailText, detail, source, base, details, _a, first, _b, entries, pages, page, next, _c, _d, _e, e, chapters, status;
        var e_2, _f;
        return __generator(this, function(_g) {
          switch (_g.label) {
            case 0:
              slug = novelPath.replace(/^\/novels\//, "").replace(/\/+$/, "");
              return [4, fetchText("".concat(API, "/novels/").concat(encodeURIComponent(slug), "/"))];
            case 1:
              detailText = _g.sent();
              detail = (0, parsers_1.parseNovelSources)(detailText);
              if (!detail.name) {
                throw new Error("Could not load the novel " + novelPath);
              }
              source = (0, parsers_1.chooseSource)(detail);
              base = "".concat(API, "/novels/").concat(encodeURIComponent(slug), "/").concat(encodeURIComponent(source.slug));
              _a = parsers_1.parseSourceDetails;
              return [4, fetchText(base + "/")];
            case 2:
              details = _a.apply(void 0, [_g.sent()]);
              _b = parsers_1.parseChaptersPage;
              return [4, fetchText(base + "/chapters/")];
            case 3:
              first = _b.apply(void 0, [_g.sent()]);
              entries = first.entries.slice();
              pages = Math.min(first.totalPages, MAX_CHAPTER_PAGES);
              page = 2;
              _g.label = 4;
            case 4:
              if (!(page <= pages)) return [3, 7];
              _c = parsers_1.parseChaptersPage;
              return [4, fetchText("".concat(base, "/chapters/?page=").concat(page))];
            case 5:
              next = _c.apply(void 0, [_g.sent()]);
              try {
                for (_d = (e_2 = void 0, __values(next.entries)), _e = _d.next(); !_e.done; _e = _d.next()) {
                  e = _e.value;
                  entries.push(e);
                }
              } catch (e_2_1) {
                e_2 = { error: e_2_1 };
              } finally {
                try {
                  if (_e && !_e.done && (_f = _d.return)) _f.call(_d);
                } finally {
                  if (e_2) throw e_2.error;
                }
              }
              _g.label = 6;
            case 6:
              page++;
              return [3, 4];
            case 7:
              entries.sort(function(a, b) {
                return a.id - b.id;
              });
              chapters = entries.map(function(e2) {
                return {
                  name: e2.title,
                  path: "".concat(slug, "/").concat(source.slug, "/").concat(e2.id),
                  chapterNumber: e2.id
                };
              });
              status = details.statusRaw === "Completed" ? NovelStatus.Completed : details.statusRaw === "Ongoing" ? NovelStatus.Ongoing : details.statusRaw === "On Hiatus" ? NovelStatus.OnHiatus : details.statusRaw === "Cancelled" ? NovelStatus.Cancelled : NovelStatus.Unknown;
              return [2, {
                path: novelPath,
                name: detail.name,
                cover: details.cover || void 0,
                summary: details.summary,
                author: details.author,
                genres: details.genres,
                status: status,
                chapters: chapters
              }];
          }
        });
      });
    };
    LNCrawlerPlugin2.prototype.parseChapter = function(chapterPath) {
      return __awaiter(this, void 0, void 0, function() {
        var parts, url, content, _a;
        return __generator(this, function(_b) {
          switch (_b.label) {
            case 0:
              parts = chapterPath.replace(/^\/+|\/+$/g, "").split("/");
              if (parts.length !== 3) {
                throw new Error("Unexpected chapter path: " + chapterPath);
              }
              url = "".concat(API, "/novels/").concat(encodeURIComponent(parts[0])) + "/".concat(encodeURIComponent(parts[1]), "/chapter/").concat(encodeURIComponent(parts[2]), "/");
              _a = parsers_1.parseChapterBody;
              return [4, fetchText(url)];
            case 1:
              content = _a.apply(void 0, [_b.sent()]);
              if (!content) {
                throw new Error("Chapter content not found");
              }
              return [2, content];
          }
        });
      });
    };
    LNCrawlerPlugin2.prototype.searchNovels = function(searchTerm, pageNo) {
      return __awaiter(this, void 0, void 0, function() {
        var text, page;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, fetchText("".concat(API, "/novels/search/?query=").concat(encodeURIComponent(searchTerm), "&language=en&page=").concat(pageNo, "&page_size=").concat(PAGE_SIZE))];
            case 1:
              text = _a.sent();
              page = (0, parsers_1.parseNovelListPage)(text);
              return [2, pageNo > page.totalPages ? [] : page.cards];
          }
        });
      });
    };
    return LNCrawlerPlugin2;
  })()
);
exports.default = new LNCrawlerPlugin();
try { if (typeof module !== "undefined" && module && module.exports) module.exports.default = plugin_default; } catch (e) {}
