import assert from "node:assert";

import type { ModelId } from "@dust-tt/types";
import type { Client } from "node-zendesk";
import { createClient } from "node-zendesk";

export function createZendeskClient({
  token,
  subdomain,
}: {
  token: string;
  subdomain: string;
}) {
  return createClient({ oauth: true, token, subdomain });
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
  if (connectorId) {
    const brandInDb = await ZendeskBrandResource.fetchByBrandId({
      connectorId,
      brandId,
    });
    if (brandInDb) {
      client.config.subdomain = brandInDb.subdomain;
      return client;
    }
  }
  const {
    result: { brand },
  } = await client.brand.show(brandId);
  client.config.subdomain = brand.subdomain;

  return client;
}
