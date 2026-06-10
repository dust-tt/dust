import logger from "@app/logger/logger";
import { dustManagedServiceCredentials } from "@app/types/api/credentials";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import FirecrawlApp from "@mendable/firecrawl-js";
import isNil from "lodash/isNil";
import omitBy from "lodash/omitBy";

const credentials = dustManagedServiceCredentials();

const SERPAPI_BASE_URL = "https://serpapi.com";
const SERPER_BASE_URL = "https://google.serper.dev";
const PARALLEL_BASE_URL = "https://api.parallel.ai";

export type BaseWebSearchParams = {
  query: string;
  num?: number;
  page?: number;
};

export type SerpapiParams = {
  provider: "serpapi";
  engine?: "google";
  location?: string;
  output?: "json" | "html";
  api_key?: string;
};

export type SerperParams = {
  provider: "serper";
  api_key?: string;
};

export type FirecrawlParams = {
  provider: "firecrawl";
  api_key?: string;
};

export type ParallelParams = {
  provider: "parallel";
  api_key?: string;
};

export type ParallelTaskProcessor =
  | "lite"
  | "lite-fast"
  | "base"
  | "base-fast"
  | "core"
  | "core-fast"
  | "pro"
  | "pro-fast"
  | "ultra"
  | "ultra-fast";

export type ParallelTaskParams = {
  provider: "parallel_task";
  api_key?: string;
  processor?: ParallelTaskProcessor;
};

const serpapiDefaultOptions = {
  provider: "serpapi",
  engine: "google",
  api_key: credentials.SERP_API_KEY,
  num: 10,
} satisfies Omit<BaseWebSearchParams & SerpapiParams, "query">;

export type SearchParams = BaseWebSearchParams &
  (
    | SerpapiParams
    | SerperParams
    | FirecrawlParams
    | ParallelParams
    | ParallelTaskParams
  );

export type SearchResultItem = {
  title: string;
  snippet: string;
  link: string;
};
export type SearchResponse = SearchResultItem[];

const serpapiSearch = async (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { provider, query, page, ...options }: BaseWebSearchParams & SerpapiParams
): Promise<Result<SearchResponse, Error>> => {
  if (options.api_key == null) {
    return new Err(
      new Error("utils/websearch: a DUST_MANAGED_SERP_API_KEY is required")
    );
  }

  const urlParams = new URLSearchParams(
    omitBy(
      {
        q: query,
        start: page
          ? page * (options.num ?? serpapiDefaultOptions.num)
          : undefined,
        num: options.num ?? serpapiDefaultOptions.num,
        ...options,
      },
      isNil
    ) as Record<string, any>
  );

  const prm = urlParams.toString();

  logger.debug({ prm }, "URL params");

  // eslint-disable-next-line no-restricted-globals
  const res = await fetch(
    `${SERPAPI_BASE_URL}/search?${urlParams.toString()}`,
    {
      method: "GET",
    }
  );

  logger.debug({ ok: res.ok, status: res.status }, "get serpapi");

  if (res.ok) {
    const json = await res.json();

    if ("organic_results" in json && Array.isArray(json.organic_results)) {
      const results = json.organic_results.reduce(
        (acc: SearchResultItem[], item: any) => {
          if (item.title && item.link) {
            acc.push({
              title: item.title,
              link: item.link,
              snippet: item.snippet ?? "",
            });
          }
          return acc;
        },
        [] as SearchResultItem[]
      );

      return new Ok(results);
    }

    return new Ok([]);
  }

  // TODO: Remove once we have a proper error handling.
  logger.error(
    { status: res.status, statusText: res.statusText },
    "Bad request on SerpAPI"
  );

  return new Err(new Error(`Bad request on SerpAPI: ${res.statusText}`));
};

const serperSearch = async (
  options: BaseWebSearchParams & SerperParams
): Promise<Result<SearchResponse, Error>> => {
  const serperApiKey = options.api_key ?? credentials.SERPER_API_KEY;
  if (serperApiKey == null || serperApiKey.length === 0) {
    return new Err(new Error("utils/websearch: a DUST_MANAGED_SERPER_API_KEY is required"));
  }

  // eslint-disable-next-line no-restricted-globals
  const res = await fetch(`${SERPER_BASE_URL}/search`, {
    method: "POST",
    headers: {
      "X-API-KEY": serperApiKey,
      "Content-Type": "application/json",
    },
    // Serper expects the query under `q`.
    body: JSON.stringify({
      q: options.query,
      num: options.num ?? serpapiDefaultOptions.num,
      ...(options.page ? { page: options.page } : {}),
    }),
  });

  if (res.ok) {
    const json = await res.json();
    const entries = Array.isArray(json?.organic) ? json.organic : [];
    const results: SearchResultItem[] = removeNulls(
      entries.map((entry: any) => {
        if (!entry?.link) {
          return null;
        }
        return {
          title: entry.title ?? entry.link,
          link: entry.link,
          snippet: entry.snippet ?? "",
        };
      })
    );
    return new Ok(results);
  }

  // TODO: Remove once we have a proper error handling.
  logger.error(
    { status: res.status, statusText: res.statusText },
    "Bad request on Serper"
  );

  return new Err(new Error(`Bad request on Serper: ${res.statusText}`));
};

const firecrawlSearch = async ({
  query,
  num,
  api_key,
}: BaseWebSearchParams & FirecrawlParams): Promise<
  Result<SearchResponse, Error>
> => {
  const firecrawlApiKey = api_key ?? credentials.FIRECRAWL_API_KEY;

  if (!firecrawlApiKey) {
    return new Err(
      new Error("utils/websearch: a DUST_MANAGED_FIRECRAWL_API_KEY is required")
    );
  }

  const fc = new FirecrawlApp({
    apiKey: firecrawlApiKey,
  });

  const limit = num ?? serpapiDefaultOptions.num;

  let response;
  try {
    response = await fc.search(query, {
      limit,
      lang: "en",
      country: "us",
      scrapeOptions: { formats: [] },
    });
  } catch (error: any) {
    logger.error({ error }, "Unexpected error on Firecrawl search");
    return new Err(normalizeError(error));
  }

  if (!response.success) {
    logger.error({ error: response.error }, "Bad request on Firecrawl search");
    return new Err(
      new Error(
        `Bad request on Firecrawl search: ${response.error ?? "Unknown error"}`
      )
    );
  }

  const results: SearchResultItem[] = removeNulls(
    response.data.map((doc) => {
      const link = doc.metadata?.sourceURL ?? doc.url;

      if (!link) {
        return;
      }

      return {
        title: doc.metadata?.title ?? doc.title ?? doc.url ?? "Untitled result",
        link,
        snippet: doc.description ?? "",
      };
    })
  );

  return new Ok(results);
};

const parallelSearch = async ({
  query,
  num,
  api_key,
}: BaseWebSearchParams & ParallelParams): Promise<
  Result<SearchResponse, Error>
> => {
  const parallelApiKey = api_key ?? credentials.PARALLEL_API_KEY;

  if (!parallelApiKey) {
    return new Err(
      new Error("utils/websearch: a DUST_MANAGED_PARALLEL_API_KEY is required")
    );
  }

  // eslint-disable-next-line no-restricted-globals
  const res = await fetch(`${PARALLEL_BASE_URL}/v1/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": parallelApiKey,
    },
    body: JSON.stringify({
      objective: query,
      search_queries: [query],
    }),
  });

  if (!res.ok) {
    logger.error(
      { status: res.status, statusText: res.statusText },
      "Bad request on Parallel search"
    );
    return new Err(
      new Error(`Bad request on Parallel search: ${res.statusText}`)
    );
  }

  const json = await res.json();
  const entries = Array.isArray(json?.results) ? json.results : [];
  const results: SearchResultItem[] = removeNulls(
    entries.map((entry: any) => {
      const link = entry.url;
      if (typeof link !== "string" || link.length === 0) {
        return null;
      }
      const excerpts = Array.isArray(entry.excerpts)
        ? entry.excerpts.filter((e: unknown) => typeof e === "string")
        : [];
      return {
        title: entry.title ?? link,
        link,
        snippet: excerpts.join("\n"),
      };
    })
  );

  return new Ok(results.slice(0, num ?? serpapiDefaultOptions.num));
};

const parallelTaskSearch = async ({
  query,
  api_key,
  processor = "pro-fast",
}: BaseWebSearchParams & ParallelTaskParams): Promise<
  Result<SearchResponse, Error>
> => {
  const parallelApiKey = api_key ?? credentials.PARALLEL_API_KEY;

  if (!parallelApiKey) {
    return new Err(
      new Error("utils/websearch: a DUST_MANAGED_PARALLEL_API_KEY is required")
    );
  }

  // 1) Create task run.
  // eslint-disable-next-line no-restricted-globals
  const createRes = await fetch(`${PARALLEL_BASE_URL}/v1/tasks/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": parallelApiKey,
    },
    body: JSON.stringify({
      input: query,
      processor,
      task_spec: {
        output_schema: {
          type: "text",
        },
      },
    }),
  });

  if (!createRes.ok) {
    logger.error(
      { status: createRes.status, statusText: createRes.statusText },
      "Bad request on Parallel task run create"
    );
    return new Err(
      new Error(
        `Bad request on Parallel task run create: ${createRes.statusText}`
      )
    );
  }

  const createJson = await createRes.json();
  const runId = createJson?.run_id;
  if (typeof runId !== "string" || runId.length === 0) {
    return new Err(new Error("Parallel task run create missing run_id"));
  }

  // 2) Retrieve final result (blocking endpoint for pro/pro-fast style runs).
  // eslint-disable-next-line no-restricted-globals
  const resultRes = await fetch(`${PARALLEL_BASE_URL}/v1/tasks/runs/${runId}/result`, {
    method: "GET",
    headers: {
      "x-api-key": parallelApiKey,
    },
  });

  if (!resultRes.ok) {
    logger.error(
      { status: resultRes.status, statusText: resultRes.statusText, runId },
      "Bad request on Parallel task run result"
    );
    return new Err(
      new Error(
        `Bad request on Parallel task run result: ${resultRes.statusText}`
      )
    );
  }

  const resultJson = await resultRes.json();
  const outputContent =
    (typeof resultJson?.output?.content === "string" &&
      resultJson.output.content) ||
    (typeof resultJson?.result?.output?.content === "string" &&
      resultJson.result.output.content) ||
    "";

  const basis =
    resultJson?.output?.basis ??
    resultJson?.result?.output?.basis ??
    [];

  const citationItems: SearchResultItem[] = Array.isArray(basis)
    ? removeNulls(
        basis.flatMap((entry: any) => {
          const citations = Array.isArray(entry?.citations)
            ? entry.citations
            : [];
          return citations.map((citation: any) => {
            const link = citation?.url ?? citation?.uri;
            if (typeof link !== "string" || link.length === 0) {
              return null;
            }
            return {
              title:
                (typeof citation?.title === "string" && citation.title) ||
                (typeof entry?.field === "string" && entry.field) ||
                "Parallel Task citation",
              link,
              snippet:
                (typeof citation?.excerpt === "string" && citation.excerpt) ||
                (typeof citation?.text === "string" && citation.text) ||
                "",
            };
          });
        })
      )
    : [];

  // The synthesized research output is the primary value of the Task API;
  // citations come after it as supporting sources.
  const contentItem: SearchResultItem = {
    title: "Parallel Task research result",
    link: `https://api.parallel.ai/v1/tasks/runs/${runId}/result`,
    snippet: outputContent || "Parallel Task completed without text output.",
  };

  return new Ok([contentItem, ...citationItems]);
};

/**
 * Make a web search using SerpAPI, Serper or Firecrawl
 * @param {SearchParams} params
 */
export const webSearch = async (
  params: SearchParams
): Promise<Result<SearchResponse, Error>> => {
  const { provider } = params;
  switch (provider) {
    case "serpapi": {
      return serpapiSearch({
        ...serpapiDefaultOptions,
        ...params,
      });
    }
    case "serper": {
      return serperSearch(params);
    }
    case "firecrawl": {
      return firecrawlSearch(params);
    }
    case "parallel": {
      return parallelSearch(params);
    }
    case "parallel_task": {
      return parallelTaskSearch(params);
    }
    default:
      assertNever(provider);
  }
};
