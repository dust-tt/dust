import _ from "lodash";

import logger from "@app/logger/logger";
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
  page?: number;
};

export type SerperParams = {
  provider: "serper";
  api_key: string;
};

const serpapiDefaultOptions = {
  provider: "serpapi",
  engine: "google",
  api_key: credentials.SERP_API_KEY,
  num: 10,
} satisfies Omit<BaseWebSearchParams & SerpapiParams, "query">;

export type SearchParams = BaseWebSearchParams & (SerpapiParams | SerperParams);

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
    _.omitBy(
      {
        q: query,
        start: page
          ? page * (options.num ?? serpapiDefaultOptions.num)
          : undefined,
        num: options.num ?? serpapiDefaultOptions.num,
        ...options,
      },
      _.isNil
    ) as Record<string, any>
  );

  const prm = urlParams.toString();

  logger.debug({ prm }, "URL params");

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

  // TODO: Remove once we have a proper error handling.
  logger.error(
    { status: res.status, statusText: res.statusText },
    "Bad request on Serper"
  );

  return new Err(new Error(`Bad request on Serper: ${res.statusText}`));
};

/**
 * Make a google search using SerpAPI or Serper
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
    default:
      assertNever(provider);
  }
};
