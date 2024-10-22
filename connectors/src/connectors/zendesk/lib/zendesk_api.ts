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
