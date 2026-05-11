import { z } from "zod";

// When viewing ContentNodes, we have 4 view types: "tables", "documents", "data_warehouse" and "all".
// - The "table" view allows picking tables in the Extract and TableQuery tools,
// which applies to Notion, Google Drive, Microsoft, Snowflake and BigQuery connectors.
// - The "document" view allows picking documents in the Search tool,
// which is useful for all connectors except Snowflake and BigQuery.
// - The "data_warehouse" view is like "table" but allows selecting intermediate hierarchy nodes
// (databases, schemas) in addition to tables, used for the data warehouses tool.
// - The "all" view shows all nodes, which is used in the Knowledge tab for displaying content node trees.
// More precisely, the "table" (resp. "document") view hides leaves that are document (resp. table).

// Define a schema for ContentNodesViewType using zod.
// WARNING: when changing this schema, search and map for comments on ContentNodesViewTypeCodec
// because parts of the codebase could not use this type directly (and as such commented)
export const ContentNodesViewTypeCodec = z.enum([
  "table",
  "document",
  "data_warehouse",
  "all",
]);

export type ContentNodesViewType = z.infer<typeof ContentNodesViewTypeCodec>;

export function isValidContentNodesViewType(
  value: unknown
): value is ContentNodesViewType {
  return ContentNodesViewTypeCodec.safeParse(value).success;
}

// Check if a Content Node ID is a valid Content Node ID for a sheet within a
// Google Spreadsheet.
export function isGoogleSheetContentNodeInternalId(
  internalId: string
): boolean {
  return (
    internalId.startsWith("google-spreadsheet-") &&
    internalId.includes("-sheet-")
  );
}
