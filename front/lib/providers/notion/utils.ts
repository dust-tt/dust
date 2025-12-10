import { Client } from "@notionhq/client";

export const MAX_CONTENT_SIZE = 32000; // Max characters to return for file content
export const MAX_FILE_SIZE = 64 * 1024 * 1024; // 64 MB max original file size

export function getNotionClient(accessToken: string) {
  return new Client({ auth: accessToken });
}
