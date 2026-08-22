import { MAX_EXPORT_ITEMS } from "@app/lib/api/actions/servers/shopify/client";
import type { ExportResult } from "@app/lib/api/actions/servers/shopify/types";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function renderExport<N>(
  label: string,
  { nodes, truncated }: ExportResult<N>
): CallToolResult["content"] {
  const summary = truncated
    ? `Exported ${nodes.length} ${label} (truncated at the ${MAX_EXPORT_ITEMS}-record cap).`
    : `Exported ${nodes.length} ${label}.`;
  return [
    { type: "text" as const, text: summary },
    { type: "text" as const, text: JSON.stringify(nodes, null, 2) },
  ];
}
