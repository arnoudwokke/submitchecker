// Haalt artikelen op (geen CORS-problemen dankzij host-permissies). Het uitlezen van de datum
// gebeurt in het content script (DOMParser bestaat niet in een Chrome-service-worker).
const api = typeof browser !== "undefined" ? browser : chrome;

async function fetchPage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { credentials: "include", redirect: "follow", signal: ctrl.signal, cache: "no-store" });
    const html = await res.text();
    return { ok: true, html: html.slice(0, 3000000), status: res.status, finalUrl: res.url };
  } catch (e) {
    return { ok: false, error: e.name === "AbortError" ? "timeout" : "ophalen mislukt" };
  } finally {
    clearTimeout(timer);
  }
}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "fetchUrl") {
    fetchPage(msg.url).then(sendResponse);
    return true; // async antwoord
  }
});
