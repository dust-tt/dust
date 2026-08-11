import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  createShopifyClient,
  MAX_EXPORT_ITEMS,
} from "@app/lib/api/actions/servers/shopify/client";
import { SHOPIFY_TOOLS_METADATA } from "@app/lib/api/actions/servers/shopify/metadata";
import { renderExport } from "@app/lib/api/actions/servers/shopify/rendering";
import { Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof SHOPIFY_TOOLS_METADATA> = {
  export_products: async (
    { status, vendor, searchQuery, limit },
    { authInfo }
  ) => {
    const clientRes = createShopifyClient(authInfo);
    if (clientRes.isErr()) {
      return clientRes;
    }
    const res = await clientRes.value.exportProducts({
      status,
      vendor,
      searchQuery,
      limit: limit ?? MAX_EXPORT_ITEMS,
    });
    if (res.isErr()) {
      return res;
    }
    return new Ok(renderExport("products", res.value));
  },

  export_customer_ltv: async (
    { sortByAmountSpent, minAmountSpentDollars, limit },
    { authInfo }
  ) => {
    const clientRes = createShopifyClient(authInfo);
    if (clientRes.isErr()) {
      return clientRes;
    }
    const res = await clientRes.value.exportCustomerLtv({
      sortByAmountSpent,
      minAmountSpentDollars,
      limit: limit ?? MAX_EXPORT_ITEMS,
    });
    if (res.isErr()) {
      return res;
    }
    return new Ok(renderExport("customers", res.value));
  },

  export_sales: async (
    { startDate, endDate, financialStatus, fulfillmentStatus, limit },
    { authInfo }
  ) => {
    const clientRes = createShopifyClient(authInfo);
    if (clientRes.isErr()) {
      return clientRes;
    }
    const res = await clientRes.value.exportSales({
      startDate,
      endDate,
      financialStatus,
      fulfillmentStatus,
      limit: limit ?? MAX_EXPORT_ITEMS,
    });
    if (res.isErr()) {
      return res;
    }
    return new Ok(renderExport("orders", res.value));
  },

  export_top_customers_by_period: async (
    { startDate, endDate, limit },
    { authInfo }
  ) => {
    const clientRes = createShopifyClient(authInfo);
    if (clientRes.isErr()) {
      return clientRes;
    }
    const res = await clientRes.value.exportTopCustomersByPeriod({
      startDate,
      endDate,
      limit: limit ?? MAX_EXPORT_ITEMS,
    });
    if (res.isErr()) {
      return res;
    }
    return new Ok(renderExport("top customers", res.value));
  },
};

export const TOOLS = buildTools(SHOPIFY_TOOLS_METADATA, handlers);
