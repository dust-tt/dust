import type { JSONSchema7 as JSONSchema } from "json-schema";

/**
 * Generates a title for an extract results JSON file based on the schema
 *
 * @param schema - The JSON schema used for extraction
 * @returns A formatted file title string with .json extension
 */
export function getExtractFileTitle({
  schema,
}: {
  schema: JSONSchema | null;
}): string {
  const schemaNames = Object.keys(schema?.properties ?? {}).join("_");
  const title = schema?.title || schemaNames || "extract_results";
  // Make sure title is truncated to 100 characters
  return `${title.substring(0, 100)}.json`;
}
