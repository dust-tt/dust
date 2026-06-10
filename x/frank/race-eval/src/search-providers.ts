// Direct provider calls for the search-only "unit test" eval. These
// intentionally mirror front/lib/utils/websearch.ts so the harness measures
// what the Dust tool would receive, isolated from the agent loop.

export type SearchProviderName = "firecrawl" | "parallel";

export const SEARCH_PROVIDERS: SearchProviderName[] = [
  "firecrawl",
  "parallel",
];

export interface ProviderSearchResult {
  title: string;
  link: string;
  snippet: string;
  publish_date?: string;
}

export interface ProviderSearchResponse {
  provider: SearchProviderName;
  query: string;
  latency_ms: number;
  results: ProviderSearchResult[];
  error?: string;
}

// Keys resolve from the DUST_MANAGED_* name first — that is what the front
// server uses, and the eval should exercise the same credentials the server
// sees. Bare names remain as ad hoc fallbacks.
const KEY_ENV_NAMES: Record<SearchProviderName, string[]> = {
  firecrawl: ["DUST_MANAGED_FIRECRAWL_API_KEY", "FIRECRAWL_API_KEY"],
  parallel: ["DUST_MANAGED_PARALLEL_API_KEY", "PARALLEL_API_KEY"],
};

export function resolveProviderKey(
  provider: SearchProviderName
): string | undefined {
  return KEY_ENV_NAMES[provider]
    .map((name) => process.env[name])
    .find((value) => value && value.length > 0);
}

export function providerKeyEnvNames(provider: SearchProviderName): string[] {
  return KEY_ENV_NAMES[provider];
}

export async function providerSearch(
  provider: SearchProviderName,
  query: string,
  num: number
): Promise<ProviderSearchResponse> {
  const startedAtMs = Date.now();
  try {
    const results = await dispatchSearch(provider, query, num);
    return {
      provider,
      query,
      latency_ms: Date.now() - startedAtMs,
      results,
    };
  } catch (error: unknown) {
    return {
      provider,
      query,
      latency_ms: Date.now() - startedAtMs,
      results: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function dispatchSearch(
  provider: SearchProviderName,
  query: string,
  num: number
): Promise<ProviderSearchResult[]> {
  switch (provider) {
    case "firecrawl":
      return firecrawlSearch(query, num);
    case "parallel":
      return parallelSearch(query, num);
  }
}

function requiredKey(provider: SearchProviderName): string {
  const value = resolveProviderKey(provider);
  if (!value) {
    throw new Error(
      `Missing API key for ${provider} (set one of: ${KEY_ENV_NAMES[provider].join(", ")})`
    );
  }
  return value;
}

async function parallelSearch(query: string, num: number): Promise<ProviderSearchResult[]> {
  const res = await fetch("https://api.parallel.ai/v1/search", {
    method: "POST",
    headers: {
      "x-api-key": requiredKey("parallel"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      objective: query,
      search_queries: [query],
    }),
  });
  if (!res.ok) {
    throw new Error(`Parallel HTTP ${res.status}: ${await safeBody(res)}`);
  }
  const json: any = await res.json();
  const entries = Array.isArray(json?.results) ? json.results : [];
  return entries
    .filter((entry: any) => typeof entry?.url === "string")
    .slice(0, num)
    .map((entry: any) => ({
      title: entry.title ?? entry.url,
      link: entry.url,
      snippet: Array.isArray(entry.excerpts)
        ? entry.excerpts.filter((e: unknown) => typeof e === "string").join("\n")
        : "",
      publish_date:
        typeof entry.publish_date === "string" ? entry.publish_date : undefined,
    }));
}

async function firecrawlSearch(query: string, num: number): Promise<ProviderSearchResult[]> {
  const res = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredKey("firecrawl")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, limit: num, lang: "en", country: "us" }),
  });
  if (!res.ok) {
    throw new Error(`Firecrawl HTTP ${res.status}: ${await safeBody(res)}`);
  }
  const json: any = await res.json();
  const entries = Array.isArray(json?.data) ? json.data : [];
  return entries
    .filter((entry: any) => typeof (entry?.url ?? entry?.metadata?.sourceURL) === "string")
    .map((entry: any) => ({
      title: entry.title ?? entry.metadata?.title ?? entry.url,
      link: entry.url ?? entry.metadata.sourceURL,
      snippet: entry.description ?? "",
    }));
}

async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<unreadable body>";
  }
}
