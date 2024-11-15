import assert from "node:assert";

import type { ModelId } from "@dust-tt/types";
import type { Client } from "node-zendesk";
import { createClient } from "node-zendesk";

import type {
  ZendeskFetchedArticle,
  ZendeskFetchedTicket,
} from "@connectors/@types/node-zendesk";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
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
  const text = await rawResponse.text();
  const response = JSON.parse(text);

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
    logger.error({ response }, "[Zendesk] Zendesk API error");
    throw new Error(`Zendesk API error: ${text}`);
  }

  return response;
}

/**
 * Fetches a batch of articles in a category from the Zendesk API.
 */
export async function fetchZendeskArticlesInCategory({
  subdomain,
  accessToken,
  categoryId,
  pageSize,
  cursor = null,
}: {
  subdomain: string;
  accessToken: string;
  categoryId: number;
  pageSize: number;
  cursor: string | null;
}): Promise<{
  articles: ZendeskFetchedArticle[];
  meta: { has_more: boolean; after_cursor: string };
}> {
  assert(
    pageSize <= 100,
    `pageSize must be at most 100 (current value: ${pageSize})` // https://developer.zendesk.com/api-reference/introduction/pagination
  );

  const response = await fetchFromZendeskWithRetries({
    url:
      `https://${subdomain}.zendesk.com/api/v2/help_center/categories/${categoryId}/articles?page[size]=${pageSize}` +
      (cursor ? `&page[after]=${cursor}` : ""),
    accessToken,
  });
  return (
    response || { articles: [], meta: { has_more: false, after_cursor: "" } }
  );
}

/**
 * Fetches a batch of the recently updated tickets from the Zendesk API using the incremental API endpoint.
 */
export async function fetchRecentlyUpdatedTickets({
  subdomain,
  accessToken,
  startTime = null,
  cursor = null,
}: // pass either a cursor or a start time, but not both
| {
      subdomain: string;
      accessToken: string;
      startTime: number | null;
      cursor?: never;
    }
  | {
      subdomain: string;
      accessToken: string;
      startTime?: never;
      cursor: string | null;
    }): Promise<{
  tickets: ZendeskFetchedTicket[];
  end_of_stream: boolean;
  after_cursor: string;
}> {
  const response = await fetchFromZendeskWithRetries({
    url:
      `https://${subdomain}.zendesk.com/api/v2/incremental/tickets/cursor.json` +
      (cursor ? `?cursor=${cursor}` : "") +
      (startTime ? `?start_time=${startTime}` : ""),
    accessToken,
  });
  return (
    response || {
      tickets: [],
      end_of_stream: false,
      after_cursor: "",
    }
  );
}

export async function fetchSolvedZendeskTicketsInBrand({
  brandSubdomain,
  accessToken,
  pageSize,
  cursor,
}: {
  brandSubdomain: string;
  accessToken: string;
  pageSize: number;
  cursor: string | null;
}): Promise<{
  tickets: ZendeskFetchedTicket[];
  meta: { has_more: boolean; after_cursor: string };
}> {
  assert(
    pageSize <= 100,
    `pageSize must be at most 100 (current value: ${pageSize})`
  );

  const searchQuery = encodeURIComponent("status:solved");
  const response = await fetchFromZendeskWithRetries({
    url:
      `https://${brandSubdomain}.zendesk.com/api/v2/search/export.json?query=${searchQuery}&filter[type]=ticket&page[size]=${pageSize}` +
      (cursor ? `&page[after]=${cursor}` : ""),
    accessToken,
  });

  return response
    ? {
        tickets: response.results || [],
        meta: {
          has_more: !!response.meta?.has_more,
          after_cursor: response.meta?.after_cursor || "",
        },
      }
    : { tickets: [], meta: { has_more: false, after_cursor: "" } };
}
