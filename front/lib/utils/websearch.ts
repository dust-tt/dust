import type { Result } from "@app/types";
import { assertNever, dustManagedCredentials, Err, Ok } from "@app/types";

const credentials = dustManagedCredentials();

const SERPAPI_BASE_URL = "https://serpapi.com";
const SERPER_BASE_URL = "https://google.serper.dev";

export type BaseWebSearchParams = {
  query: string;
  num?: number;
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
  api_key: string;
};

const serpapiDefaultOptions: Omit<
  BaseWebSearchParams & SerpapiParams,
  "query"
> = {
  provider: "serpapi",
  engine: "google",
  api_key: credentials.SERPER_API_KEY,
};

export type SearchParams = BaseWebSearchParams & (SerpapiParams | SerperParams);

export type SearchResultItem = {
  title: string;
  snippet: string;
  link: string;
};
export type SearchResponse = SearchResultItem[];

const serpapiSearch = async (
  options: BaseWebSearchParams & SerpapiParams
): Promise<Result<SearchResponse, Error>> => {
  if (options.api_key == null && serpapiDefaultOptions.api_key == null) {
    return new Err(
      new Error("util/webtools: a DUST_MANAGED_SERP_API_KEY is required")
    );
  }

  const urlParams = new URLSearchParams(
    JSON.stringify({
      ...options,
    })
  );

  const res = await fetch(
    `${SERPAPI_BASE_URL}/search?${urlParams.toString()}`,
    {
      method: "GET",
    }
  );

  if (res.ok) {
    const json = await res.json();

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

  return new Err(new Error("Bad request on SerpAPI"));
};

const serperSearch = async (
  options: BaseWebSearchParams & SerperParams
): Promise<Result<SearchResponse, Error>> => {
  if (options.api_key == null) {
    return new Err(new Error("DUST_MANAGED_SERP_API_KEY is missing"));
  }

  const res = await fetch(`${SERPER_BASE_URL}/search`, {
    method: "POST",
    headers: {
      "X-API-KEY": options.api_key,
    },
    body: JSON.stringify(options),
  });

  if (res.ok) {
    const json = await res.json();
    // WARN: need to format Serper results before using
    return new Ok(json);
  }

  return new Err(new Error("Bad request on SerpAPI"));
};

/**
 * Make a google search using SerpAPI
 * @param {string} query - Google search query
 * @param {SearchParams} options - To override the default serpapi search options
 */
export const webSearch = async (
  params: SearchParams
): Promise<Result<SearchResponse, Error>> => {
  const { provider } = params;
  switch (provider) {
    case "serpapi": {
      return serpapiSearch({
        ...params,
        ...serpapiDefaultOptions,
      });
    }
    case "serper": {
      return serperSearch(params);
    }
    default:
      assertNever(provider);
  }
};
