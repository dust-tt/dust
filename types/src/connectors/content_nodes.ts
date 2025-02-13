import * as t from "io-ts";

// When viewing ContentNodes, we have 3 view types: "tables", "documents" and "all".
// - The "tables" view allows picking tables in the Extract and TableQuery tools,
// which applies to Notion, Google Drive, Microsoft, Snowflake and BigQuery connectors.
// - The "documents" view allows picking documents in the Search tool,
// which is useful for all connectors except Snowflake and BigQuery.
// - The "all" view shows all nodes, which is used in the Knowledge tab for displaying content node trees.
// More precisely, the "tables" (resp. "documents") view hides leaves that are documents (resp. tables).

// Define a codec for ContentNodesViewType using io-ts.
export const ContentNodesViewTypeCodec = t.union([
  t.literal("tables"),
  t.literal("documents"),
  t.literal("all"),
]);

export type ContentNodesViewType = t.TypeOf<typeof ContentNodesViewTypeCodec>;

export function isValidContentNodesViewType(
  value: unknown
): value is ContentNodesViewType {
  return value === "documents" || value === "tables" || value === "all";
}
