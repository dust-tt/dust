import type {
  CustomerListResult,
  ProductListResult,
} from "@app/lib/api/actions/servers/shopify/types";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function renderCustomerList({
  customers,
}: CustomerListResult): CallToolResult["content"] {
  return [{ type: "text", text: JSON.stringify(customers, null, 2) }];
}

export function renderProductList({
  products,
}: ProductListResult): CallToolResult["content"] {
  return [{ type: "text", text: JSON.stringify(products, null, 2) }];
}
