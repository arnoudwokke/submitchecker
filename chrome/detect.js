// Publicatiedatum uit HTML halen. Geeft {date: Date, source: string} of null.
(function (root) {
  function parseDate(v) {
    if (v == null) return null;
    let s = String(v).trim();
    if (!s) return null;
    // "2026-11-20 23:57:01 UTC" -> ISO
    s = s.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}(:\d{2})?)/, "$1T$2").replace(/\s*UTC$/i, "Z");
    s = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"); // +0000 -> +00:00
    if (/^\d{10}(\d{3})?$/.test(s)) { // unix timestamp (s of ms)
      const n = Number(s);
      const d = new Date(s.length === 10 ? n * 1000 : n);
      return isNaN(d) ? null : d;
    }
    // 20251120 of 2025-11-20 / 2025/11/20
    let m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    // 20-11-2025 / 20.11.2025 (Europees)
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    const d = new Date(s);
    if (isNaN(d)) return null;
    const y = d.getFullYear();
    if (y < 1995 || y > new Date().getFullYear() + 1) return null;
    return d;
  }

  function fromJsonLd(doc) {
    const found = [];
    const walk = (o) => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) return o.forEach(walk);
      if (o.datePublished) found.push(o.datePublished);
      if (o["@graph"]) walk(o["@graph"]);
      if (o.mainEntity) walk(o.mainEntity);
    };
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try { walk(JSON.parse(s.textContent)); } catch (e) { /* kapotte JSON negeren */ }
    });
    for (const v of found) {
      const d = parseDate(Array.isArray(v) ? v[0] : v);
      if (d) return d;
    }
    return null;
  }

  const META_KEYS = [
    "article:published_time", "og:article:published_time", "og:published_time",
    "datepublished", "date_published", "published_time", "publish-date", "publish_date",
    "publishdate", "pubdate", "article.published", "parsely-pub-date", "sailthru.date",
    "dc.date.issued", "dcterms.issued", "dc.date", "dcterms.created", "dc.date.created",
    "citation_publication_date", "citation_date", "article_date_original", "date",
    "cxenseparse:recs:publishtime", "originalpublicationdate", "creation_date"
  ];

  function fromMeta(doc) {
    const map = {};
    doc.querySelectorAll("meta").forEach((m) => {
      const k = (m.getAttribute("property") || m.getAttribute("name") || m.getAttribute("itemprop") || "").toLowerCase();
      const v = m.getAttribute("content");
      if (k && v && !(k in map)) map[k] = v;
    });
    for (const k of META_KEYS) {
      if (map[k]) { const d = parseDate(map[k]); if (d) return { date: d, source: "meta " + k }; }
    }
    return null;
  }

  function fromMarkup(doc) {
    const el = doc.querySelector('[itemprop="datePublished"]');
    if (el) {
      const d = parseDate(el.getAttribute("content") || el.getAttribute("datetime") || el.textContent);
      if (d) return { date: d, source: "itemprop datePublished" };
    }
    const sel = "time[pubdate][datetime], article time[datetime], main time[datetime], time[datetime], relative-time[datetime], local-time[datetime], shreddit-post[created-timestamp], faceplate-timeago[ts], [created-timestamp], [data-datetime], [data-date], [data-published]";
    for (const t of doc.querySelectorAll(sel)) {
      if (t.closest("nav, footer, aside, .side, .sidebar, [class*=sidebar]")) continue;
      const d = parseDate(t.getAttribute("datetime") || t.getAttribute("created-timestamp") || t.getAttribute("ts") || t.getAttribute("data-datetime") || t.getAttribute("data-date") || t.getAttribute("data-published"));
      if (d) return { date: d, source: "<" + t.tagName.toLowerCase() + " datetime>" };
    }
    return null;
  }

  // Laatste redmiddel: een datum die gewoon als tekst op de pagina staat.
  const MONTHS = {
    jan: 1, januari: 1, january: 1, janvier: 1, januar: 1, "jän": 1,
    feb: 2, februari: 2, february: 2, "février": 2, fevrier: 2, februar: 2,
    mrt: 3, mar: 3, maart: 3, march: 3, mars: 3, "märz": 3, maerz: 3,
    apr: 4, april: 4, avril: 4,
    mei: 5, may: 5, mai: 5,
    jun: 6, juni: 6, june: 6, juin: 6,
    jul: 7, juli: 7, july: 7, juillet: 7,
    aug: 8, augustus: 8, august: 8, "août": 8, aout: 8,
    sep: 9, sept: 9, september: 9, septembre: 9,
    okt: 10, oct: 10, oktober: 10, october: 10, octobre: 10,
    nov: 11, november: 11, novembre: 11,
    dec: 12, dez: 12, december: 12, "décembre": 12, decembre: 12, dezember: 12
  };
  const MON = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
  const UNITS = { minute: 0, minuut: 0, minuten: 0, minutes: 0, min: 0, hour: 0, hours: 0, uur: 0, heure: 0, heures: 0, stunde: 0, stunden: 0,
    day: 1, days: 1, dag: 1, dagen: 1, jour: 1, jours: 1, tag: 1, tagen: 1,
    week: 7, weeks: 7, weken: 7, semaine: 7, semaines: 7, woche: 7, wochen: 7,
    month: 30, months: 30, maand: 30, maanden: 30, mois: 30, monat: 30, monaten: 30,
    year: 365, years: 365, jaar: 365, jaren: 365, ans: 365, jahr: 365, jahren: 365 };
  const UNIT = Object.keys(UNITS).sort((a, b) => b.length - a.length).join("|");
  const daysAgo = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return d; };

  const TEXT_PATTERNS = [
    // 23/11/2026, 23-11-2026, 23.11.2026
    [/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/, (m) => new Date(+m[3], +m[2] - 1, +m[1])],
    // 2026-11-23
    [/\b(20\d{2})-(\d{2})-(\d{2})\b/, (m) => new Date(+m[1], +m[2] - 1, +m[3])],
    // 23 november 2026, 23 nov. 2026, 1er décembre 2026
    [new RegExp("\\b(\\d{1,2})(?:er|e|st|nd|rd|th)?\\.?\\s+(" + MON + ")\\.?,?\\s+(20\\d{2})\\b", "i"), (m) => new Date(+m[3], MONTHS[m[2].toLowerCase()] - 1, +m[1])],
    // November 23, 2026
    [new RegExp("\\b(" + MON + ")\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b", "i"), (m) => new Date(+m[3], MONTHS[m[1].toLowerCase()] - 1, +m[2])],
    // persbureau-dateline zonder jaar: "BRUSSELS, Nov 23 (Reuters) -"
    [new RegExp("\\b(" + MON + ")\\.?\\s+(\\d{1,2})\\s+\\((?:Reuters|AP|AFP|Bloomberg|dpa|ANP|Belga)\\)", "i"), (m) => {
      const now = new Date();
      let d = new Date(now.getFullYear(), MONTHS[m[1].toLowerCase()] - 1, +m[2]);
      if (d > new Date(now.getTime() + 86400000)) d.setFullYear(d.getFullYear() - 1);
      return d;
    }],
    // 3 days ago / 3 dagen geleden
    [new RegExp("\\b(\\d{1,3}|an?|een)\\s+(" + UNIT + ")\\s+(?:ago|geleden)\\b", "i"), (m) => daysAgo((/^\d/.test(m[1]) ? +m[1] : 1) * UNITS[m[2].toLowerCase()])],
    // il y a 3 jours / vor 3 Tagen
    [new RegExp("\\b(?:il y a|vor)\\s+(\\d{1,3}|un|une|einem|einer)\\s+(" + UNIT + ")\\b", "i"), (m) => daysAgo((/^\d/.test(m[1]) ? +m[1] : 1) * UNITS[m[2].toLowerCase()])],
    [/\b(yesterday|gisteren|gestern)\b/i, () => daysAgo(1)],
    [/\b(today|vandaag|aujourd'hui|heute)\b/i, () => daysAgo(0)]
  ];

  function fromText(doc) {
    const body = doc.body;
    if (!body) return null;
    body.querySelectorAll("script, style, noscript, template, svg, nav, footer, aside, [role=navigation], [aria-hidden=true]").forEach((e) => e.remove());
    const scope = doc.querySelector("article") || doc.querySelector("main, [role=main]") || body;
    // Eventueel de header buiten de artikelinhoud weglaten
    if (scope === body) body.querySelectorAll("body > header").forEach((e) => e.remove());
    // tekstnodes los samenvoegen met spaties, zodat "x" + "23/11/2026" niet aan elkaar plakt
    const parts = [];
    const walker = doc.createTreeWalker(scope, 4 /* NodeFilter.SHOW_TEXT */);
    while (walker.nextNode()) parts.push(walker.currentNode.nodeValue);
    const text = parts.join(" ").replace(/\s+/g, " ");
    let best = null;
    for (const [re, mk] of TEXT_PATTERNS) {
      const m = re.exec(text);
      if (!m) continue;
      const d = mk(m);
      if (!d || isNaN(d) || d > new Date(Date.now() + 86400000) || d.getFullYear() < 1995) continue;
      if (!best || m.index < best.index) best = { index: m.index, date: d, snippet: m[0] };
    }
    return best ? { date: best.date, source: "tekst op pagina: \u201c" + best.snippet + "\u201d" } : null;
  }

  function fromUrl(url) {
    if (!url) return null;
    let path = url;
    try { const u = new URL(url); path = u.pathname; } catch (e) { /* laat zo */ }
    // /2026/11/23/, /2026-11-23/, ...-2026-11-23/, _2026_11_23
    let m = path.match(/(?:^|[\/_.-])(20\d{2})([\/_-])(\d{1,2})\2(\d{1,2})(?=$|[\/_.-])/);
    if (m && +m[3] >= 1 && +m[3] <= 12 && +m[4] >= 1 && +m[4] <= 31) return new Date(+m[1], +m[3] - 1, +m[4]);
    // ...-23-11-2026
    m = path.match(/(?:^|[\/_.-])(\d{1,2})([\/_-])(\d{1,2})\2(20\d{2})(?=$|[\/_.-])/);
    if (m && +m[3] >= 1 && +m[3] <= 12 && +m[1] >= 1 && +m[1] <= 31) return new Date(+m[4], +m[3] - 1, +m[1]);
    m = path.match(/[\/_-](20\d{2})(\d{2})(\d{2})(?=$|[\/_.-])/);
    if (m && +m[2] <= 12 && +m[3] <= 31) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
  }

  function fromJsonText(text) {
    const t = (text || "").trimStart();
    if (!(t.startsWith("{") || t.startsWith("["))) return null;
    let data;
    try { data = JSON.parse(t); } catch (e) { return null; }
    const keys = ["created_utc", "datePublished", "published_at", "publishedAt", "created_at", "date"];
    const seen = new Set();
    const queue = [data];
    while (queue.length) {
      const o = queue.shift();
      if (!o || typeof o !== "object" || seen.has(o)) continue;
      seen.add(o);
      for (const k of keys) {
        if (o[k] != null && typeof o[k] !== "object") {
          const v = k === "created_utc" ? Math.round(Number(o[k])) : o[k];
          const d = parseDate(v);
          if (d) return { date: d, source: "JSON " + k };
        }
      }
      for (const v of Array.isArray(o) ? o : Object.values(o)) if (v && typeof v === "object") queue.push(v);
    }
    return null;
  }

  function detectPublishDate(html, urls) {
    const json = fromJsonText(html);
    if (json) return json;
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    let d = fromJsonLd(doc);
    if (d) return { date: d, source: "JSON-LD datePublished" };
    const meta = fromMeta(doc);
    if (meta) return meta;
    const mk = fromMarkup(doc);
    if (mk) return mk;
    for (const u of urls || []) {
      d = fromUrl(u);
      if (d) return { date: d, source: "datum in URL" };
    }
    return fromText(doc);
  }

  root.detectPublishDate = detectPublishDate;
})(typeof window !== "undefined" ? window : globalThis);
