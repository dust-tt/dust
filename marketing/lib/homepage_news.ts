import { getAllHomepageNews } from "@marketing/lib/contentful/client";
import type { NewsItem } from "@marketing/lib/contentful/types";

export type { NewsItem };

// Last-known-good list — used when the Contentful fetch fails (network
// blip, credentials rotation, etc.) so the homepage never breaks. Keep
// roughly in sync with the live Contentful entries when shipping major
// homepage updates so the fallback doesn't surface stale press links.
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

// Fetches the marketing-managed news list from Contentful. Designed to be
// called from `getStaticProps` / `getServerSideProps`. Falls back to the
// hardcoded `FALLBACK_NEWS` array on any failure so the page never breaks
// because of a transient external dependency. Contentful's CDA already
// serves from a CDN, so we don't add a layer of in-memory caching here —
// each request hits Contentful's edge cache directly.
export async function fetchHomepageNews(): Promise<NewsItem[]> {
  const result = await getAllHomepageNews();
  if (result.isErr() || result.value.length === 0) {
    return FALLBACK_NEWS;
  }
  return result.value;
}
