(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const cache = new Map();

  // Sommige sites (Reddit) geven een JS-challenge i.p.v. de pagina; probeer dan eerst een betere bron.
  function candidateUrls(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^(www|old|new|np|m|sh)\./, "");
      // Persberichten van de Europese Commissie: inhoud komt uit een API
      const ec = u.hostname === "ec.europa.eu" && u.pathname.match(/\/presscorner\/detail\/([a-z]{2})\/([a-z]+_\d+_\d+)/i);
      if (ec) return [
        `https://ec.europa.eu/commission/presscorner/api/documents?reference=${encodeURIComponent(ec[2].toUpperCase().replace(/_/g, "/"))}&language=${ec[1]}`,
        url
      ];
      if (host === "reddit.com" || host === "redd.it") {
        const m = u.pathname.match(/\/comments\/([a-z0-9]+)/i) || (host === "redd.it" && u.pathname.match(/^\/([a-z0-9]+)/i));
        if (m) return [
          `https://www.reddit.com/comments/${m[1]}/.json?raw_json=1`,
          `https://old.reddit.com/comments/${m[1]}/`,
          url
        ];
        return [u.origin + u.pathname];
      }
    } catch (e) { /* ongeldige url */ }
    return [url];
  }

  async function fetchPage(url) {
    try { return await api.runtime.sendMessage({ type: "fetchUrl", url }); }
    catch (e) { return { ok: false, error: "extensiefout" }; }
  }

  // canonieke link en artikeltitel, voor het herkennen van dubbele submits
  function pageInfo(page) {
    const info = { finalUrl: page && page.finalUrl };
    if (!page || !page.ok || !page.html || page.status >= 400) return info;
    try {
      const doc = new DOMParser().parseFromString(page.html, "text/html");
      const attr = (sel, a) => doc.querySelector(sel)?.getAttribute(a)?.trim();
      const base = page.finalUrl || undefined;
      const canon = attr('link[rel="canonical"]', "href") || attr('meta[property="og:url"]', "content");
      if (canon) { try { info.canonical = new URL(canon, base).href; } catch (e) {} }
      info.title = attr('meta[property="og:title"]', "content") || attr('meta[name="twitter:title"]', "content") || doc.title?.trim();
    } catch (e) { /* negeren */ }
    return info;
  }

  async function checkUrl(url) {
    if (cache.has(url)) return cache.get(url);
    let page = null, r = null, weak = null;
    const cands = candidateUrls(url);
    for (let i = 0; i < cands.length; i++) {
      const p = await fetchPage(cands[i]);
      if (!page || (p && p.ok)) page = p;
      r = p && p.ok ? detectPublishDate(p.html, [url, p.finalUrl]) : null;
      // een datum uit losse tekst is zwak: liever nog de volgende bron proberen
      if (r && /^tekst op pagina/.test(r.source) && i < cands.length - 1) { weak = weak || { r, p }; r = null; }
      if (r) { page = p; break; }
    }
    if (!r && weak) { r = weak.r; page = weak.p; }
    const info = pageInfo(page);
    if (!r) r = page && page.ok ? null : detectPublishDate("", [url]);
    const result = r
      ? { ok: true, date: r.date.toISOString(), source: r.source + (page && page.ok ? "" : " (pagina niet bereikbaar)"), finalUrl: page && page.finalUrl, ...info }
      : { ok: false, ...info, error: page && page.ok ? "geen datum gevonden" + (page.status >= 400 ? " (HTTP " + page.status + ")" : "") : (page && page.error) || "onbekend" };
    if (result.ok) cache.set(url, result);
    return result;
  }

  const DAY = 86400000;
  const CONCURRENCY = 4;
  let settings = { days: 2, auto: true, feed: true };
  let running = false;

  const isInternal = (a) => {
    try { return /(^|\.)tweakers\.net$/i.test(new URL(a.href, location.href).hostname); }
    catch (e) { return true; }
  };
  const isHttp = (a) => /^https?:/i.test(a.href || "");

  // Zoek in een rij de link naar het bronartikel.
  function sourceLink(row) {
    const links = [...row.querySelectorAll("a[href]")].filter(isHttp);
    // 1. externe link (niet tweakers.net)
    const ext = links.find((a) => !isInternal(a));
    if (ext) return ext.href;
    // 2. link met een "link"-icoon (kan een redirect via tweakers zijn)
    const icon = links.find((a) => {
      const img = a.querySelector("img, i, span, svg");
      const txt = [a.title, a.className, img && (img.getAttribute("src") || ""), img && img.getAttribute("alt"), img && img.getAttribute("title"), img && img.className && String(img.className)].join(" ");
      return /link|bron|source|extern/i.test(txt);
    });
    return icon ? icon.href : null;
  }

  function findRows() {
    return [...document.querySelectorAll("tr")]
      .map((tr) => ({ tr, cb: tr.querySelector('input[type="checkbox"]') }))
      .filter((r) => r.cb && !r.tr.closest("thead") && !r.tr.querySelector("th"))
      .map((r) => ({ ...r, url: sourceLink(r.tr) }));
  }

  function titleCell(tr) {
    const cells = [...tr.cells];
    // breedste tekstcel = titel
    return cells.reduce((best, c) => (c.textContent.trim().length > (best ? best.textContent.trim().length : -1) ? c : best), null) || tr.lastElementChild;
  }

  function setStatus(tr, cls, text, tip) {
    let s = tr.querySelector(".sc-status:not(.sc-dup):not(.sc-feed)");
    if (!s) { s = document.createElement("span"); const dup = tr.querySelector(".sc-dup, .sc-feed"); dup ? dup.before(s) : titleCell(tr).appendChild(s); }
    s.className = "sc-status " + cls;
    s.textContent = text;
    s.title = tip || "";
  }

  const fmt = (d) => d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
  const daysOld = (d) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = new Date(d); day.setHours(0, 0, 0, 0);
    return Math.round((today - day) / DAY);
  };

  // ---- Dubbele submits ----
  const TRACKING = /^(utm_.*|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|ref|ref_src|ref_url|source|src|ocid|cmpid|cid|igshid|si|share|smid|taid|at_.*|_ga|_gl|js_challenge|jsc_.*|solution|output|outputtype|amp|s|feature)$/i;

  function normUrl(url) {
    try {
      const u = new URL(url);
      let host = u.hostname.toLowerCase().replace(/^(www\d?|m|mobile|amp|old|new|np)\./, "");
      let path = u.pathname.replace(/\/(amp|amp\.html)\/?$/i, "/").replace(/\/+$/, "").replace(/\.amp$/i, "");
      if (host === "reddit.com" || host === "redd.it") {
        const m = path.match(/\/comments\/([a-z0-9]+)/i) || (host === "redd.it" && path.match(/^\/([a-z0-9]+)/i));
        if (m) return "reddit:" + m[1].toLowerCase();
      }
      if (host === "youtu.be") return "youtube:" + path.slice(1);
      if (host === "youtube.com" && u.searchParams.get("v")) return "youtube:" + u.searchParams.get("v");
      const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
      return host + path.toLowerCase() + (params.length ? "?" + new URLSearchParams(params).toString() : "");
    } catch (e) { return url; }
  }

  function rowTitle(tr) {
    const c = titleCell(tr).cloneNode(true);
    c.querySelectorAll(".sc-status, .sc-dup, .sc-feed").forEach((e) => e.remove());
    return c.textContent.replace(/\s+/g, " ").trim();
  }

  const STOP = new Set("een het van voor met dit dat die deze nog niet ook naar over door bij uit als aan zijn wordt worden heeft hebben kan zal zou wil gaat meer the and for with from that this will has have are was its into new nieuwe".split(" "));
  const ROMAN = { ii: "2", iii: "3", iv: "4", vi: "6", vii: "7", viii: "8", ix: "9" };
  const SYN = { executable: "exe", executables: "exe", exes: "exe", playstation: "ps", ps5: "ps5", "6s": "6s" };
  // Woorden uit een titel; .strong bevat de "kenmerkende" woorden: namen, afkortingen, getallen.
  function words(t) {
    const set = new Set();
    set.strong = new Set();
    const raw = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^A-Za-z0-9]+/).filter(Boolean);
    raw.forEach((orig, i) => {
      let w = orig.toLowerCase();
      if (ROMAN[w] && orig === orig.toUpperCase()) w = ROMAN[w];
      w = SYN[w] || w;
      if (!((w.length >= 3 || /^\d+$/.test(w) || /^[A-Z0-9]{2,}$/.test(orig)) && !STOP.has(w))) return;
      w = stem(w);
      set.add(w);
      const strong = /\d/.test(w) || /^[A-Z0-9]{2,}$/.test(orig) || /[a-z][A-Z]/.test(orig) || (i > 0 && /^[A-Z]/.test(orig));
      if (strong) set.strong.add(w);
    });
    return set;
  }
  function stem(w) {
    if (/^\d+$/.test(w) || w.length <= 4) return w;
    // Nederlandse voltooide deelwoorden: (uit)gelekt -> lekt, gestolen -> stolen
    if (w.length >= 7) w = w.replace(/^(uitge|opge|aange|ge)/, "");
    return w.replace(/(ing|en|es|s|e)$/, "");
  }
  // true als twee titels over hetzelfde lijken te gaan
  function similar(a, b) {
    if (!a || !b || !a.size || !b.size) return false;
    const shared = [...a].filter((w) => b.has(w));
    const inter = shared.length;
    // exact dezelfde woorden (bv. twee keer "Todoist beveiligingsincident")
    if (inter === a.size && inter === b.size) return true;
    if (a.size < 2 || b.size < 2) return false;
    const jaccard = inter / (a.size + b.size - inter);
    const overlap = inter / Math.min(a.size, b.size);
    // dezelfde kenmerkende namen/getallen (bv. "Cyberleek", "GTA", "6") en een flink deel van de korte titel
    const strong = shared.filter((w) => a.strong.has(w) || b.strong.has(w)).length;
    if ((jaccard >= 0.4 && (inter >= 3 || strong >= 1)) || (inter >= 3 && overlap >= 0.5)) return true;
    // korte titel die helemaal in de andere zit
    if (inter >= 2 && overlap === 1 && (jaccard >= 0.5 || strong >= 1)) return true;
    return strong >= 3 || (strong >= 2 && inter >= 3 && overlap >= 0.35);
  }

  // Rijen staan op submitdatum oplopend: een rij is "niet eerste" als een rij erboven hetzelfde tipt.
  function markDuplicates(rows) {
    let n = 0;
    rows.forEach((r, i) => {
      r.tr.querySelector(".sc-dup")?.remove();
      if (!r.title) r.title = rowTitle(r.tr);
      const info = r.info || {};
      r.keys = new Set([r.url, info.finalUrl, info.canonical].filter(Boolean).map(normUrl));
      r.titles = [words(r.title), info.title && words(info.title)].filter(Boolean);
      let first = null, why = "";
      for (let j = 0; j < i && !first; j++) {
        const o = rows[j];
        if ([...r.keys].some((k) => o.keys.has(k))) { first = o; why = "zelfde artikel"; }
        else if (r.titles.some((a) => o.titles.some((b) => similar(a, b)))) { first = o; why = "bijna dezelfde titel"; }
      }
      if (!first) return;
      const s = document.createElement("span");
      s.className = "sc-status sc-dup";
      s.textContent = "niet eerste submit";
      s.title = `${why} als eerdere submit:\n${first.title}`;
      titleCell(r.tr).appendChild(s);
      if (!r.cb.checked) {
        r.cb.checked = true;
        r.cb.dispatchEvent(new Event("change", { bubbles: true }));
        n++;
      }
    });
    return n;
  }

  // ---- Staat het al op Tweakers? (vergelijking met de RSS-feed) ----
  const FEED_URL = "https://tweakers.net/feeds/mixed.xml";
  let feedPromise = null;
  function loadFeed() {
    if (!feedPromise) feedPromise = (async () => {
      const page = await fetchPage(FEED_URL + "?_=" + Date.now());
      if (!page || !page.ok || !page.html) return [];
      const xml = new DOMParser().parseFromString(page.html, "text/xml");
      return [...xml.querySelectorAll("item, entry")].map((it) => {
        const txt = (sel) => it.querySelector(sel)?.textContent?.trim() || "";
        const link = txt("link") || it.querySelector("link")?.getAttribute("href") || txt("guid");
        const descHtml = txt("description") || txt("summary") || txt("content");
        const desc = new DOMParser().parseFromString(descHtml, "text/html");
        const hrefs = [...desc.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /^https?:/i.test(h));
        const title = txt("title");
        return { title, link, words: words(title), keys: new Set(hrefs.filter((h) => !/tweakers\.net/i.test(h)).map(normUrl)), date: txt("pubDate") || txt("published") };
      }).filter((f) => f.title);
    })().catch(() => []);
    return feedPromise;
  }

  async function markFeed(rows) {
    if (!settings.feed) return 0;
    const feed = await loadFeed();
    let n = 0;
    for (const r of rows) {
      r.tr.querySelector(".sc-feed")?.remove();
      if (!r.keys) continue;
      let hit = null, why = "";
      for (const f of feed) {
        if ([...r.keys].some((k) => f.keys.has(k))) { hit = f; why = "zelfde bron"; break; }
        if (r.titles.some((a) => similar(a, f.words))) { hit = f; why = "lijkt op"; break; }
      }
      if (!hit) continue;
      const a = document.createElement("a");
      a.className = "sc-status sc-feed";
      a.textContent = "mogelijk al op Tweakers";
      a.href = hit.link;
      a.target = "_blank";
      a.rel = "noopener";
      a.title = `${why} Tweakers-artikel:\n${hit.title}${hit.date ? "\n" + hit.date : ""}`;
      titleCell(r.tr).appendChild(a);
      if (!r.cb.checked) {
        r.cb.checked = true;
        r.cb.dispatchEvent(new Event("change", { bubbles: true }));
        n++;
      }
    }
    return n;
  }

  async function run() {
    if (running) return;
    running = true;
    const rows = findRows();
    const counter = document.querySelector(".sc-count");
    let done = 0, unknown = 0;
    feedPromise = null; // feed opnieuw ophalen bij elke controle
    let checked = markDuplicates(rows);
    checked += await markFeed(rows);
    const update = () => counter && (counter.textContent = `${done}/${rows.length} gecontroleerd · ${checked} aangevinkt · ${unknown} onbekend`);
    update();

    const queue = rows.slice();
    const worker = async () => {
      while (queue.length) {
        const r = queue.shift();
        if (!r.url) { setStatus(r.tr, "sc-unknown", "geen bronlink gevonden"); unknown++; done++; update(); continue; }
        setStatus(r.tr, "sc-busy", "bezig…", r.url);
        let res;
        try { res = await checkUrl(r.url); }
        catch (e) { res = { ok: false, error: "fout bij uitlezen" }; }
        r.info = res;
        if (res && res.ok) {
          const d = new Date(res.date);
          const age = daysOld(d);
          const old = age >= settings.days;
          setStatus(r.tr, old ? "sc-old" : "sc-new", `${fmt(d)} · ${age} d${old ? " · oud" : ""}`, `${res.source}\n${res.finalUrl || r.url}`);
          if (old && !r.cb.checked) {
            r.cb.checked = true;
            r.cb.dispatchEvent(new Event("change", { bubbles: true }));
            checked++;
          }
        } else {
          setStatus(r.tr, "sc-unknown", "datum onbekend", `${(res && res.error) || "onbekend"}\n${r.url}`);
          unknown++;
        }
        done++; update();
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    // nogmaals, nu met de echte artikellinks en -titels
    checked += markDuplicates(rows);
    checked += await markFeed(rows);
    update();
    running = false;
  }

  function panel() {
    const table = document.querySelector("table input[type=checkbox]")?.closest("table");
    if (!table) return;
    const p = document.createElement("div");
    p.className = "sc-panel";
    p.innerHTML = `<strong>Submitchecker</strong>
      <label>Aanvinken vanaf <input type="number" min="0" class="sc-days"> dagen oud</label>
      <label><input type="checkbox" class="sc-auto"> automatisch bij laden</label>
      <label title="Vergelijk met de Tweakers-feed en vink submits aan die er al lijken te staan"><input type="checkbox" class="sc-feed-opt"> check Tweakers-feed</label>
      <button type="button" class="sc-run">Nu controleren</button>
      <span class="sc-count"></span>`;
    table.parentNode.insertBefore(p, table);
    const days = p.querySelector(".sc-days"), auto = p.querySelector(".sc-auto"), feedOpt = p.querySelector(".sc-feed-opt");
    days.value = settings.days; auto.checked = settings.auto; feedOpt.checked = settings.feed !== false;
    const save = () => {
      settings = { days: Math.max(0, parseInt(days.value, 10) || 0), auto: auto.checked, feed: feedOpt.checked };
      api.storage.local.set({ settings }).catch(() => {});
    };
    days.addEventListener("change", save);
    auto.addEventListener("change", save);
    feedOpt.addEventListener("change", save);
    p.querySelector(".sc-run").addEventListener("click", (e) => { e.preventDefault(); run(); });
  }

  (async () => {
    try { const s = await api.storage.local.get("settings"); if (s.settings) settings = { ...settings, ...s.settings }; } catch (e) {}
    panel();
    if (settings.auto) run();
  })();
})();
