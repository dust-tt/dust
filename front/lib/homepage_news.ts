import config from "@app/lib/api/config";

export interface NewsItem {
  source: string;
  title: string;
  date: string;
  href: string;
}

// Last-known-good list — used when the Google Sheet fetch fails (network
// blip, missing env var, malformed CSV, etc.) so the homepage never breaks.
// Keep this in sync with the live sheet when shipping major copy changes.
export const FALLBACK_NEWS: NewsItem[] = [
  {
    source: "VIBESCALING PODCAST",
    title:
      "How We Built Profound's GTM Motion To A $1B+ Valuation w/ Mark Ebert, SVP of Revenue @ Profound",
    date: "May 12, 2026",
    href: "https://youtu.be/iDF_On2kOxo",
  },
  {
    source: "HYPERTEXT",
    title: "What is ARR anyway?",
    date: "Apr 17, 2026",
    href: "https://hypertext.fyi/what-is-arr-anyway/",
  },
  {
    source: "WING VC",
    title: "Enterprise Tech 30 List 2026",
    date: "Mar 31, 2026",
    href: "https://www.wing.vc/et30/list",
  },
  {
    source: "VENTUREBEAT",
    title:
      "Dust hits $6M ARR helping enterprises build AI agents that actually do stuff instead of just talking",
    date: "Jul 3, 2025",
    href: "https://venturebeat.com/ai/dust-hits-6m-arr-helping-enterprises-build-ai-agents-that-actually-do-stuff-instead-of-just-talking",
  },
  {
    source: "SEQUOIA CAPITAL",
    title: "Partnering with Dust: LLM-Powered Productivity",
    date: "Jul 3, 2023",
    href: "https://sequoiacap.com/article/partnering-with-dust-llm-powered-productivity/",
  },
];

// Minimal RFC-4180-ish CSV parser. Handles quoted fields with embedded commas
// and escaped double quotes ("" -> "). Doesn't handle multi-line cells —
// not needed for the news sheet shape (one row = one news item).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  // Strip BOM if Google added one.
  const cleaned = text.replace(/^﻿/, "");
  for (const rawLine of cleaned.split(/\r?\n/)) {
    if (!rawLine.trim()) {
      continue;
    }
    const row: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < rawLine.length; i++) {
      const ch = rawLine[i];
      if (inQuotes) {
        if (ch === '"' && rawLine[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          row.push(cur);
          cur = "";
        } else {
          cur += ch;
        }
      }
    }
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

// Truthy values in the `published` column. Anything else hides the row.
const TRUTHY_PUBLISHED = new Set(["TRUE", "Y", "YES", "1"]);

function rowsToNews(rows: string[][]): NewsItem[] {
  if (rows.length < 2) {
    return [];
  }
  const [header, ...dataRows] = rows;
  const indexOf = (key: string) =>
    header.findIndex((h) => h.trim().toLowerCase() === key);
  const sourceIdx = indexOf("source");
  const titleIdx = indexOf("title");
  const dateIdx = indexOf("date");
  const hrefIdx = indexOf("href");
  const publishedIdx = indexOf("published");

  if (sourceIdx < 0 || titleIdx < 0 || dateIdx < 0 || hrefIdx < 0) {
    return [];
  }

  const items: NewsItem[] = [];
  for (const row of dataRows) {
    const source = (row[sourceIdx] ?? "").trim();
    const title = (row[titleIdx] ?? "").trim();
    const date = (row[dateIdx] ?? "").trim();
    const href = (row[hrefIdx] ?? "").trim();
    if (!source || !title || !href) {
      continue;
    }
    if (publishedIdx >= 0) {
      const flag = (row[publishedIdx] ?? "").trim().toUpperCase();
      if (!TRUTHY_PUBLISHED.has(flag)) {
        continue;
      }
    }
    items.push({ source, title, date, href });
  }
  return items;
}

function sortNewsByDateDesc(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => {
    const ta = Date.parse(a.date);
    const tb = Date.parse(b.date);
    if (Number.isNaN(ta) && Number.isNaN(tb)) {
      return 0;
    }
    if (Number.isNaN(ta)) {
      return 1;
    }
    if (Number.isNaN(tb)) {
      return -1;
    }
    return tb - ta;
  });
}

// Per-process cache so the `/` route's `getServerSideProps` doesn't hit
// Google Sheets on every request. The `/home` route uses `getStaticProps +
// revalidate` and is already cached at the Next.js layer; this helps the
// SSR path. Each serverless instance caches independently — fine for
// homepage-scale traffic.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { items: NewsItem[]; expiresAt: number } | null = null;

// Fetches the marketing-managed news list from the published Google Sheet
// CSV. Returns the fallback array on any failure so the homepage build
// never breaks because of a flaky external dependency. If the fetch fails
// but stale cached items exist, returns the stale items instead of the
// fallback so recent edits aren't lost during transient Sheets outages.
export async function fetchHomepageNews(): Promise<NewsItem[]> {
  if (cache && Date.now() < cache.expiresAt) {
    return cache.items;
  }
  const url = config.getHomepageNewsSheetCsvUrl();
  if (!url) {
    return FALLBACK_NEWS;
  }
  try {
    const res = await fetch(url, {
      // Don't ride on Next.js' aggressive default cache — own the cadence
      // via the in-memory cache above.
      cache: "no-store",
    });
    if (!res.ok) {
      return cache?.items ?? FALLBACK_NEWS;
    }
    const text = await res.text();
    const items = sortNewsByDateDesc(rowsToNews(parseCsv(text)));
    const final = items.length > 0 ? items : FALLBACK_NEWS;
    cache = { items: final, expiresAt: Date.now() + CACHE_TTL_MS };
    return final;
  } catch {
    return cache?.items ?? FALLBACK_NEWS;
  }
}
