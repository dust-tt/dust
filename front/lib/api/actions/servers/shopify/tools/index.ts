import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createShopifyClient } from "@app/lib/api/actions/servers/shopify/client";
import { MAX_EXPORT_ITEMS } from "@app/lib/api/actions/servers/shopify/helpers";
import { SHOPIFY_TOOLS_METADATA } from "@app/lib/api/actions/servers/shopify/metadata";
import { renderProductList } from "@app/lib/api/actions/servers/shopify/rendering";
import { Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof SHOPIFY_TOOLS_METADATA> = {
  list_products: async (
    { status, vendor, searchQuery, limit },
    { authInfo }
  ) => {
    const client = createShopifyClient(authInfo);
    if (client.isErr()) {
      return client;
    }
    const products = await client.value.listProducts({
      status,
      vendor,
      searchQuery,
      limit: limit ?? MAX_EXPORT_ITEMS,
    });
    if (products.isErr()) {
      return products;
    }
    return new Ok(renderProductList(products.value));
  },
};

export const TOOLS = buildTools(SHOPIFY_TOOLS_METADATA, handlers);
