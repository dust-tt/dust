import { MAX_EXPORT_ITEMS } from "@app/lib/api/actions/servers/shopify/helpers";
import type { ProductListResult } from "@app/lib/api/actions/servers/shopify/types";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function renderProductList({
  products,
  truncated,
}: ProductListResult): CallToolResult["content"] {
  const summary = truncated
    ? `Listed ${products.length} products (truncated at the ${MAX_EXPORT_ITEMS}-product cap).`
    : `Listed ${products.length} products.`;
  return [
    { type: "text", text: summary },
    { type: "text", text: JSON.stringify(products, null, 2) },
  ];
}
