import { isString, safeParseJSON } from "@app/types";

export async function* createAsyncGenerator<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

export function extractEncryptedContentFromMetadata(metadata: string): string {
  const parsed = safeParseJSON(metadata);
  if (parsed.isErr()) {
    throw new Error(
      `Failed to parse reasoning metadata JSON: ${parsed.error.message}`
    );
  }
  const encryptedContent =
    parsed.value &&
    "encrypted_content" in parsed.value &&
    isString(parsed.value.encrypted_content)
      ? parsed.value.encrypted_content
      : "";
  return encryptedContent;
}

export function extractIdFromMetadata(metadata: string): string {
  const parsed = safeParseJSON(metadata);
  if (parsed.isErr()) {
    throw new Error(
      `Failed to parse reasoning metadata JSON: ${parsed.error.message}`
    );
  }
  const id =
    parsed.value && "id" in parsed.value && isString(parsed.value.id)
      ? parsed.value.id
      : "";
  return id;
}
