import { Client } from "@notionhq/client";

export function getNotionClient(accessToken: string) {
  return new Client({ auth: accessToken });
}
