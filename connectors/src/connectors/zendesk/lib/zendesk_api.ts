import type { Client } from "node-zendesk";
import { createClient } from "node-zendesk";

export function createZendeskClient({
  token,
  subdomain = "d3v-dust",
}: {
  token: string;
  subdomain?: string;
}) {
  return createClient({ oauth: true, token, subdomain });
}

export async function changeZendeskClientSubdomain({
  client,
  brandId,
}: {
  client: Client;
  brandId: number;
}) {
  const {
    result: { brand },
  } = await client.brand.show(brandId);
  client.config.subdomain = brand.subdomain;
  return client;
}
