import assert from "node:assert";

import type { ModelId } from "@dust-tt/types";
import type { Client } from "node-zendesk";
import { createClient } from "node-zendesk";

import type { ZendeskFetchedArticle } from "@connectors/connectors/zendesk/lib/node-zendesk-types";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import { ZendeskBrandResource } from "@connectors/resources/zendesk_resources";

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
 */
export async function changeZendeskClientSubdomain(
  client: Client,
  {
    connectorId = null,
    brandId,
  }: {
    connectorId?: ModelId | null;
    brandId: number;
  }
) {
  client.config.subdomain = await getZendeskBrandSubdomain(client, {
    connectorId,
    brandId,
  });
  return client;
}

/**
 * Retrieves a brand's subdomain from the database if it exists, fetches it from the Zendesk API otherwise.
 */
export async function getZendeskBrandSubdomain(
  client: Client,
  {
    connectorId = null,
    brandId,
  }: {
    connectorId?: ModelId | null;
    brandId: number;
  }
): Promise<string> {
  if (connectorId) {
    const brandInDb = await ZendeskBrandResource.fetchByBrandId({
      connectorId,
      brandId,
    });
    if (brandInDb) {
      return brandInDb.subdomain;
    }
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
    const retryAfter = Number(response.headers.get("Retry-After")) || 60;
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return true;
  }
  return false;
}

/**
 * Fetches a batch of articles in a category from the Zendesk API.
 */
export async function fetchZendeskArticlesInCategory({
  subdomain,
  accessToken,
  categoryId,
  pageSize = 100,
  cursor = null,
}: {
  subdomain: string;
  accessToken: string;
  categoryId: number;
  pageSize?: number;
  cursor?: string | null;
}): Promise<{
  articles: ZendeskFetchedArticle[];
  meta: { hasMore: boolean; after_cursor: string };
}> {
  assert(
    pageSize <= 100,
    `pageSize must be at most 100 (current value: ${pageSize})` // https://developer.zendesk.com/api-reference/introduction/pagination
  );
  const runFetch = async () =>
    fetch(
      `https://${subdomain}.zendesk.com/api/v2/help_center/categories/${categoryId}/articles?page[size]=${pageSize}` +
        (cursor ? `&page[after]=${cursor}` : ""),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

  let rawResponse = await runFetch();
  while (await handleZendeskRateLimit(rawResponse)) {
    rawResponse = await runFetch();
  }

  const text = await rawResponse.text();
  const response = JSON.parse(text);

  if (!rawResponse.ok) {
    if (
      response.type === "error.list" &&
      response.errors &&
      response.errors.length > 0
    ) {
      const error = response.errors[0];
      if (error.code === "unauthorized") {
        throw new ExternalOAuthTokenError();
      }
      if (error.code === "not_found") {
        return { articles: [], meta: { hasMore: false, after_cursor: "" } };
      }
    }
  }

  return response;
}
