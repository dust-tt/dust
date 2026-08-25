import { MAX_EXPORT_ITEMS } from "@app/lib/api/actions/servers/shopify/helpers";
import type { ProductExportResult } from "@app/lib/api/actions/servers/shopify/types";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function renderProductExport({
  products,
  truncated,
}: ProductExportResult): CallToolResult["content"] {
  const summary = truncated
    ? `Exported ${products.length} products (truncated at the ${MAX_EXPORT_ITEMS}-product cap).`
    : `Exported ${products.length} products.`;
  return [
    { type: "text", text: summary },
    { type: "text", text: JSON.stringify(products, null, 2) },
  ];
}
