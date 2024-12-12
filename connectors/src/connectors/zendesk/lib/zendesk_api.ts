import type { ModelId } from "@dust-tt/types";
import type { Client } from "node-zendesk";
import { createClient } from "node-zendesk";

import type {
  ZendeskFetchedArticle,
  ZendeskFetchedBrand,
  ZendeskFetchedCategory,
  ZendeskFetchedTicket,
  ZendeskFetchedUser,
} from "@connectors/@types/node-zendesk";
import { ZendeskApiError } from "@connectors/connectors/zendesk/lib/errors";
import { setTimeoutAsync } from "@connectors/lib/async_utils";
import logger from "@connectors/logger/logger";
import type { ZendeskCategoryResource } from "@connectors/resources/zendesk_resources";
import { ZendeskBrandResource } from "@connectors/resources/zendesk_resources";

const ZENDESK_RATE_LIMIT_MAX_RETRIES = 5;
const ZENDESK_RATE_LIMIT_TIMEOUT_SECONDS = 60;

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
  const brandInDb = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });
  if (brandInDb) {
    client.config.subdomain = brandInDb.subdomain;
    return brandInDb.subdomain;
  }
  const {
    result: { brand },
  } = await client.brand.show(brandId);
  client.config.subdomain = brand.subdomain;
  return brand.subdomain;
}

/**
 * Retrieves a brand's subdomain from the database if it exists, fetches it from the Zendesk API otherwise.
 */
export async function getZendeskBrandSubdomain({
  connectorId,
  brandId,
  subdomain,
  accessToken,
}: {
  connectorId: ModelId;
  brandId: number;
  subdomain: string;
  accessToken: string;
}): Promise<string> {
  const brandInDb = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });
  if (brandInDb) {
    return brandInDb.subdomain;
  }
  const brand = await fetchZendeskBrand({ subdomain, accessToken, brandId });
  if (!brand) {
    throw new Error(`Brand ${brandId} not found in Zendesk.`);
  }
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
    let retryAfter = 1;

    const headerValue = response.headers.get("retry-after"); // https://developer.zendesk.com/api-reference/introduction/rate-limits/
    if (headerValue) {
      const delay = parseInt(headerValue, 10);
      if (!Number.isNaN(delay)) {
        retryAfter = Math.max(delay, 1);
      }
    }
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
    await setTimeoutAsync(retryAfter * 1000);
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
      return null;
    }
    throw new ZendeskApiError(
      "Error parsing Zendesk API response",
      rawResponse.status,
      rawResponse
    );
  }
  if (!rawResponse.ok) {
    if (rawResponse.status === 404) {
      return null;
    }
    throw new ZendeskApiError(
      "Zendesk API error.",
      rawResponse.status,
      response
    );
  }

  return response;
}

/**
 * Fetches a single brand from the Zendesk API.
 */
export async function fetchZendeskBrand({
  subdomain,
  accessToken,
  brandId,
}: {
  subdomain: string;
  accessToken: string;
  brandId: number;
}): Promise<ZendeskFetchedBrand | null> {
  const url = `https://${subdomain}.zendesk.com/api/v2/brands/${brandId}`;
  const response = await fetchFromZendeskWithRetries({ url, accessToken });
  return response?.brand ?? null;
}

/**
 * Fetches a single article from the Zendesk API.
 */
export async function fetchZendeskArticle({
  brandSubdomain,
  accessToken,
  articleId,
}: {
  brandSubdomain: string;
  accessToken: string;
  articleId: number;
}): Promise<ZendeskFetchedArticle | null> {
  const url = `https://${brandSubdomain}.zendesk.com/api/v2/help_center/articles/${articleId}`;
  const response = await fetchFromZendeskWithRetries({ url, accessToken });
  return response?.article ?? null;
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
  const url = `https://${brandSubdomain}.zendesk.com/api/v2/help_center/incremental/articles.json?start_time=${startTime}`;
  const response = await fetchFromZendeskWithRetries({ url, accessToken });
  return {
    articles: response.articles,
    hasMore: response.next_page !== null && response.articles.length !== 0,
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
export async function fetchZendeskTickets(
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
      `https://${brandSubdomain}.zendesk.com/api/v2/incremental/tickets/cursor?start_time=${startTime}`,
    accessToken,
  });
  return {
    tickets: response.tickets,
    hasMore:
      !response.end_of_stream &&
      response.after_url !== null &&
      response.tickets.length !== 0,
    nextLink: response.after_url,
  };
}

/**
 * Fetches the number of tickets in a Brand from the Zendesk API.
 * Only counts tickets that have been solved, and that were updated within the retention period.
 */
export async function fetchZendeskTicketCount({
  accessToken,
  brandSubdomain,
  retentionPeriodDays,
  query = null,
}: {
  brandSubdomain: string;
  accessToken: string;
} & (
  | { retentionPeriodDays?: number; query: string }
  | { retentionPeriodDays: number; query?: null }
)): Promise<number> {
  logger.warn(
    "Ticket count relies on the Search API, which has proved unreliable."
  );
  query ||= `type:ticket status:solved updated>${retentionPeriodDays}days`;
  const url = `https://${brandSubdomain}.zendesk.com/api/v2/search/count?query=${encodeURIComponent(query)}`;
  const response = await fetchFromZendeskWithRetries({ url, accessToken });
  return parseInt(response.count, 10);
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
  const url = `https://${subdomain}.zendesk.com/api/v2/users/me`;
  const response = await fetchFromZendeskWithRetries({ url, accessToken });
  return response.user;
}
