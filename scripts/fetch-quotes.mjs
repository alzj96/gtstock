// Refresh data/quotes.json from Yahoo Finance (today's % change + ~30-day change).
// No dependencies; Node 18+. Reads symbols from data/watchlist.json.
//
// Why the quirks: Yahoo's old quote endpoint is auth-gated (needs a cookie+crumb),
// rejects the full desktop-Chrome UA on getcrumb (429s it), and its `spark`
// (history) endpoint caps symbols-per-request low — hence the short UA, the
// crumb flow, and the chunking below. Mirrors the dashboard backend's logic.
import { readFile, writeFile } from "node:fs/promises";

const UA = "Mozilla/5.0"; // full Chrome UA gets 429'd on getcrumb; minimal UA passes
const HOST = "https://query1.finance.yahoo.com";

const num = (v) => (v == null || !Number.isFinite(+v) ? null : +v);

async function getSession() {
  let cookie = "";
  try {
    const r = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "follow" });
    const set = typeof r.headers.getSetCookie === "function"
      ? r.headers.getSetCookie()
      : (r.headers.get("set-cookie") ? [r.headers.get("set-cookie")] : []);
    cookie = set.map((c) => c.split(";")[0]).join("; ");
  } catch { /* cookie best-effort */ }
  const cr = await fetch(`${HOST}/v1/test/getcrumb`, { headers: { "User-Agent": UA, Cookie: cookie } });
  const crumb = (await cr.text()).trim();
  if (!crumb || crumb.includes("Too Many")) throw new Error("could not obtain Yahoo crumb");
  return { cookie, crumb };
}

async function yJson(path, s) {
  const sep = path.includes("?") ? "&" : "?";
  const r = await fetch(`${HOST}${path}${sep}crumb=${encodeURIComponent(s.crumb)}`, {
    headers: { "User-Agent": UA, Cookie: s.cookie },
  });
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

async function dailyQuotes(symbols, s) {
  const out = {};
  for (let i = 0; i < symbols.length; i += 50) {
    const chunk = symbols.slice(i, i + 50);
    const j = await yJson(`/v7/finance/quote?symbols=${encodeURIComponent(chunk.join(","))}`, s);
    for (const row of j?.quoteResponse?.result ?? []) if (row.symbol) out[row.symbol] = row;
  }
  return out;
}

async function spark30d(symbols, s) {
  const out = {};
  for (let i = 0; i < symbols.length; i += 10) { // spark caps symbols-per-request low
    const chunk = symbols.slice(i, i + 10);
    const j = await yJson(`/v7/finance/spark?symbols=${encodeURIComponent(chunk.join(","))}&range=1mo&interval=1d`, s);
    for (const r of j?.spark?.result ?? []) {
      const closes = (r?.response?.[0]?.indicators?.quote?.[0]?.close ?? []).filter((c) => c != null);
      if (r.symbol && closes.length >= 2 && closes[0]) {
        out[r.symbol] = +(((closes.at(-1) - closes[0]) / closes[0]) * 100).toFixed(2);
      }
    }
  }
  return out;
}

async function main() {
  const wl = JSON.parse(await readFile(new URL("../data/watchlist.json", import.meta.url)));
  const symbols = (wl.items ?? []).map((i) => i.symbol).filter(Boolean);
  if (!symbols.length) throw new Error("no symbols in data/watchlist.json");

  const s = await getSession();
  const daily = await dailyQuotes(symbols, s);
  const priced = symbols.filter((sym) => daily[sym] && num(daily[sym].regularMarketPrice) != null);
  const monthly = await spark30d(priced, s);
  const asOf = new Date().toISOString();

  const items = symbols.map((sym) => {
    const row = daily[sym];
    const price = row ? num(row.regularMarketPrice) : null;
    if (price == null) {
      return { symbol: sym, price: null, prev_close: null, change: null, change_pct: null,
        change_30d_pct: monthly[sym] ?? null, currency: null, source: "unavailable", is_realtime: false, as_of: asOf };
    }
    const prev = num(row.regularMarketPreviousClose);
    const cp = num(row.regularMarketChangePercent);
    const ch = num(row.regularMarketChange);
    return {
      symbol: sym, price, prev_close: prev,
      change: ch != null ? +ch.toFixed(4) : (prev != null ? +(price - prev).toFixed(4) : null),
      change_pct: cp != null ? +cp.toFixed(2) : (prev ? +(((price - prev) / prev) * 100).toFixed(2) : null),
      change_30d_pct: monthly[sym] ?? null,
      currency: row.currency ?? null, source: "yahoo", is_realtime: true, as_of: asOf,
    };
  });

  await writeFile(
    new URL("../data/quotes.json", import.meta.url),
    JSON.stringify({ items, total: items.length, updated_at: asOf }),
  );
  const okD = items.filter((i) => i.change_pct != null).length;
  const okM = items.filter((i) => i.change_30d_pct != null).length;
  console.log(`quotes.json refreshed: ${items.length} symbols | daily ${okD} | 30d ${okM}`);
}

main().catch((e) => { console.error("fetch-quotes failed:", e.message); process.exit(1); });
