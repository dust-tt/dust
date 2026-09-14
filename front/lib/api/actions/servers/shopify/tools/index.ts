import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createShopifyClient } from "@app/lib/api/actions/servers/shopify/client";
import { SHOPIFY_TOOLS_METADATA } from "@app/lib/api/actions/servers/shopify/metadata";
import {
  renderCustomerList,
  renderOrderList,
  renderProductList,
} from "@app/lib/api/actions/servers/shopify/rendering";
import { Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof SHOPIFY_TOOLS_METADATA> = {
  list_customers: async (
    { state, email, tag, searchQuery, limit },
    { authInfo }
  ) => {
    const client = createShopifyClient(authInfo);
    if (client.isErr()) {
      return client;
    }
    const customers = await client.value.listCustomers({
      state,
      email,
      tag,
      searchQuery,
      limit,
    });
    if (customers.isErr()) {
      return customers;
    }
    return new Ok(renderCustomerList(customers.value));
  },
  list_orders: async ({ customerId, searchQuery, limit }, { authInfo }) => {
    const client = createShopifyClient(authInfo);
    if (client.isErr()) {
      return client;
    }
    const orders = await client.value.listOrders({
      customerId,
      searchQuery,
      limit,
    });
    if (orders.isErr()) {
      return orders;
    }
    return new Ok(renderOrderList(orders.value));
  },
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
      limit,
    });
    if (products.isErr()) {
      return products;
    }
    return new Ok(renderProductList(products.value));
  },
};

export const TOOLS = buildTools(SHOPIFY_TOOLS_METADATA, handlers);
