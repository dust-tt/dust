import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { SHOPIFY_TOOLS_METADATA } from "@app/lib/api/actions/servers/shopify/metadata";
import { Err } from "@app/types/shared/result";

// Tool contracts are registered here; the implementations land in a follow-up
// PR. Until then every handler returns a not-implemented error.
const notImplemented = () =>
  Promise.resolve(new Err(new MCPError("Shopify tool not yet implemented.")));

const handlers: ToolHandlers<typeof SHOPIFY_TOOLS_METADATA> = {
  export_products: notImplemented,
  export_customer_ltv: notImplemented,
  export_sales: notImplemented,
  export_top_customers_by_period: notImplemented,
};

export const TOOLS = buildTools(SHOPIFY_TOOLS_METADATA, handlers);
