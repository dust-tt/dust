import type { ModelId } from "@dust-tt/types";
import type { Client } from "node-zendesk";
import { createClient } from "node-zendesk";

import type {
  ZendeskFetchedArticle,
  ZendeskFetchedCategory,
  ZendeskFetchedTicket,
  ZendeskFetchedUser,
} from "@connectors/@types/node-zendesk";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import type { ZendeskCategoryResource } from "@connectors/resources/zendesk_resources";
import { ZendeskBrandResource } from "@connectors/resources/zendesk_resources";

const ZENDESK_RATE_LIMIT_MAX_RETRIES = 5;
const ZENDESK_RATE_LIMIT_TIMEOUT_SECONDS = 60;

/**
 * Retrieves the endpoint part from a URL used to call the Zendesk API.
 */
function getEndpointFromUrl(url: string): string {
  return url.split("api/v2")[1] as string;
}

export function createZendeskClient({
  accessToken,
  subdomain,
}: {
  accessToken: string;
  subdomain: string;
}) {
  return createClient({ oauth: true, token: accessToken, subdomain });
}

/**
 * Returns a Zendesk client with the subdomain set to the one in the brand.
 * Retrieves the brand from the database if it exists, fetches it from the Zendesk API otherwise.
 * @returns The subdomain of the brand the client was scoped to.
 */
export async function changeZendeskClientSubdomain(
  client: Client,
  { connectorId, brandId }: { connectorId: ModelId; brandId: number }
): Promise<string> {
  const brandSubdomain = await getZendeskBrandSubdomain(client, {
    connectorId,
    brandId,
  });
  client.config.subdomain = brandSubdomain;
  return brandSubdomain;
}

/**
 * Retrieves a brand's subdomain from the database if it exists, fetches it from the Zendesk API otherwise.
 */
async function getZendeskBrandSubdomain(
  client: Client,
  { connectorId, brandId }: { connectorId: ModelId; brandId: number }
): Promise<string> {
  const brandInDb = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });
  if (brandInDb) {
    return brandInDb.subdomain;
  }

  const {
    result: { brand },
  } = await client.brand.show(brandId);
  return brand.subdomain;
}

/**
 * Handles rate limit responses from Zendesk API.
 * Expects to find the header `Retry-After` in the response.
 * https://developer.zendesk.com/api-reference/introduction/rate-limits/
 * @returns true if the rate limit was handled and the request should be retried, false otherwise.
 */
async function handleZendeskRateLimit(response: Response): Promise<boolean> {
  if (response.status === 429) {
    const retryAfter = Math.max(
      Number(response.headers.get("Retry-After")) || 1,
      1
    );
    if (retryAfter > ZENDESK_RATE_LIMIT_TIMEOUT_SECONDS) {
      logger.info(
        { retryAfter },
        `[Zendesk] Attempting to wait more than ${ZENDESK_RATE_LIMIT_TIMEOUT_SECONDS} s, aborting.`
      );
      throw new Error(
        `Zendesk retry after larger than ${ZENDESK_RATE_LIMIT_TIMEOUT_SECONDS} s, aborting.`
      );
    }
    logger.info(
      { response, retryAfter },
      "[Zendesk] Rate limit hit, waiting before retrying."
    );
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return true;
  }
  return false;
}

/**
 * Runs a GET request to the Zendesk API with a maximum number of retries before throwing.
 */
async function fetchFromZendeskWithRetries({
  url,
  accessToken,
}: {
  url: string;
  accessToken: string;
}) {
  const runFetch = async () =>
    fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

  let rawResponse = await runFetch();

  let retryCount = 0;
  while (await handleZendeskRateLimit(rawResponse)) {
    rawResponse = await runFetch();
    retryCount++;
    if (retryCount >= ZENDESK_RATE_LIMIT_MAX_RETRIES) {
      logger.info(
        { response: rawResponse },
        `[Zendesk] Rate limit hit more than ${ZENDESK_RATE_LIMIT_MAX_RETRIES}, aborting.`
      );
      throw new Error(
        `Zendesk rate limit hit more than ${ZENDESK_RATE_LIMIT_MAX_RETRIES} times, aborting.`
      );
    }
  }
  let response;
  try {
    response = await rawResponse.json();
  } catch (e) {
    if (rawResponse.status === 404) {
      logger.error(
        { rawResponse, text: rawResponse.text },
        `[Zendesk] Zendesk API 404 error on: ${getEndpointFromUrl(url)}`
      );
      return null;
    } else if (rawResponse.status === 403) {
      throw new ExternalOAuthTokenError();
    }
    logger.error(
      { rawResponse, status: rawResponse.status, text: rawResponse.text },
      "[Zendesk] Error parsing Zendesk API response"
    );
    throw new Error("Error parsing Zendesk API response");
  }
  if (!rawResponse.ok) {
    if (response.type === "error.list" && response.errors?.length) {
      const error = response.errors[0];
      if (error.code === "unauthorized") {
        throw new ExternalOAuthTokenError();
      }
      if (error.code === "not_found") {
        return null;
      }
    }
    logger.error(
      {
        rawResponse,
        response,
        status: rawResponse.status,
        endpoint: getEndpointFromUrl(url),
      },
      "[Zendesk] Zendesk API error"
    );
    throw new Error("Zendesk API error.");
  }

  return response;
}

/**
 * Fetches a batch of categories from the Zendesk API.
 */
export async function fetchZendeskCategoriesInBrand(
  accessToken: string,
  {
    brandSubdomain,
    pageSize,
    url,
  }:
    | { brandSubdomain: string; pageSize: number; url?: never }
    | { brandSubdomain?: never; pageSize?: never; url: string }
): Promise<{
  categories: ZendeskFetchedCategory[];
  hasMore: boolean;
  nextLink: string | null;
}> {
  const response = await fetchFromZendeskWithRetries({
    url:
      url ?? // using the URL if we got one, reconstructing it otherwise
      `https://${brandSubdomain}.zendesk.com/api/v2/help_center/categories?page[size]=${pageSize}`,
    accessToken,
  });
  return {
    categories: response.categories,
    hasMore: response.meta.has_more,
    nextLink: response.links.next,
  };
}

/**
 * Fetches a batch of the recently updated articles from the Zendesk API using the incremental API endpoint.
 * https://developer.zendesk.com/documentation/help_center/help-center-api/understanding-incremental-article-exports/
 */
export async function fetchRecentlyUpdatedArticles({
  brandSubdomain,
  accessToken,
  startTime, // start time in Unix epoch time, in seconds
}: {
  brandSubdomain: string;
  accessToken: string;
  startTime: number;
}): Promise<{
  articles: ZendeskFetchedArticle[];
  hasMore: boolean;
  endTime: number;
}> {
  // this endpoint retrieves changes in content, not only in metadata despite what is mentioned in the documentation.
  const response = await fetchFromZendeskWithRetries({
    url: `https://${brandSubdomain}.zendesk.com/api/v2/help_center/incremental/articles.json?start_time=${startTime}`,
    accessToken,
  });
  return {
    articles: response.articles,
    hasMore: response.next_page !== null || response.articles.length === 0,
    endTime: response.end_time,
  };
}

/**
 * Fetches a batch of articles in a category from the Zendesk API.
 */
export async function fetchZendeskArticlesInCategory(
  category: ZendeskCategoryResource,
  accessToken: string,
  {
    brandSubdomain,
    pageSize,
    url,
  }:
    | { brandSubdomain: string; pageSize: number; url?: never }
    | { brandSubdomain?: never; pageSize?: never; url: string }
): Promise<{
  articles: ZendeskFetchedArticle[];
  hasMore: boolean;
  nextLink: string | null;
}> {
  const response = await fetchFromZendeskWithRetries({
    url:
      url ?? // using the URL if we got one, reconstructing it otherwise
      `https://${brandSubdomain}.zendesk.com/api/v2/help_center/categories/${category.categoryId}/articles?page[size]=${pageSize}`,
    accessToken,
  });
  return {
    articles: response.articles,
    hasMore: response.meta.has_more,
    nextLink: response.links.next,
  };
}

/**
 * Fetches a batch of the recently updated tickets from the Zendesk API using the incremental API endpoint.
 */
export async function fetchRecentlyUpdatedTickets(
  accessToken: string,
  {
    brandSubdomain,
    startTime,
    url,
  }:
    | { brandSubdomain: string; startTime: number; url?: never }
    | { brandSubdomain?: never; startTime?: never; url: string }
): Promise<{
  tickets: ZendeskFetchedTicket[];
  hasMore: boolean;
  nextLink: string | null;
}> {
  const response = await fetchFromZendeskWithRetries({
    url:
      url ?? // using the URL if we got one, reconstructing it otherwise
      `https://${brandSubdomain}.zendesk.com/api/v2/incremental/tickets/cursor.json?start_time=${startTime}`,
    accessToken,
  });
  return {
    tickets: response.tickets,
    hasMore: !response.end_of_stream,
    nextLink: response.after_url,
  };
}

/**
 * Fetches a batch of tickets from the Zendesk API.
 * Only fetches tickets that have been solved, and that were updated within the retention period.
 */
export async function fetchZendeskTicketsInBrand(
  accessToken: string,
  {
    brandSubdomain,
    pageSize,
    retentionPeriodDays,
    url,
  }:
    | {
        brandSubdomain: string;
        pageSize: number;
        retentionPeriodDays: number;
        url?: never;
      }
    | {
        brandSubdomain?: never;
        pageSize?: never;
        retentionPeriodDays?: never;
        url: string;
      }
): Promise<{
  tickets: ZendeskFetchedTicket[];
  hasMore: boolean;
  nextLink: string | null;
}> {
  const response = await fetchFromZendeskWithRetries({
    url:
      url ?? // using the URL if we got one, reconstructing it otherwise
      `https://${brandSubdomain}.zendesk.com/api/v2/search/export.json?filter[type]=ticket&page[size]=${pageSize}&query=${encodeURIComponent(
        `status:solved updated>${retentionPeriodDays}days`
      )}`,
    accessToken,
  });

  return {
    tickets: response.results,
    hasMore: response.meta.has_more,
    nextLink: response.links.next,
  };
}

/**
 * Fetches the current user through a call to `/users/me`.
 */
export async function fetchZendeskCurrentUser({
  subdomain,
  accessToken,
}: {
  subdomain: string;
  accessToken: string;
}): Promise<ZendeskFetchedUser> {
  const response = await fetch(
    `https://${subdomain}.zendesk.com/api/v2/users/me`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await response.json();
  return data.user;
}
