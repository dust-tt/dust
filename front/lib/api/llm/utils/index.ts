import logger from "@app/logger/logger";
import type { ModelProviderIdType, ResponseFormat } from "@app/types";
import { isString, ResponseFormatSchema, safeParseJSON } from "@app/types";

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

export function parseResponseFormatSchema(
  responseFormat: string | null,
  providerId?: ModelProviderIdType
): ResponseFormat | undefined {
  if (!responseFormat) {
    return;
  }

  const responseFormatJson = safeParseJSON(responseFormat);
  if (responseFormatJson.isErr() || responseFormatJson.value === null) {
    logger.info(
      { responseFormat, providerId },
      "Failed to parse response format to JSON"
    );
    return;
  }

  const responseFormatResult = ResponseFormatSchema.safeParse(
    responseFormatJson.value
  );
  if (responseFormatResult.error) {
    logger.info(
      { responseFormat, providerId },
      "Failed to parse response format JSON to schema"
    );
    return;
  }
  return responseFormatResult.data;
}
