import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  exportCustomerLtv,
  exportProducts,
  exportSales,
  exportTopCustomersByPeriod,
  MAX_EXPORT_ITEMS,
  renderExport,
  withShopifyAuth,
} from "@app/lib/api/actions/servers/shopify/helpers";
import { SHOPIFY_TOOLS_METADATA } from "@app/lib/api/actions/servers/shopify/metadata";
import { Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof SHOPIFY_TOOLS_METADATA> = {
  export_products: async (
    { status, vendor, searchQuery, limit },
    { authInfo }
  ) =>
    withShopifyAuth({
      authInfo,
      action: async (accessToken, shop) => {
        const res = await exportProducts(accessToken, shop, {
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
    }),

  export_customer_ltv: async (
    { sortByAmountSpent, minAmountSpentDollars, limit },
    { authInfo }
  ) =>
    withShopifyAuth({
      authInfo,
      action: async (accessToken, shop) => {
        const res = await exportCustomerLtv(accessToken, shop, {
          sortByAmountSpent,
          minAmountSpentDollars,
          limit: limit ?? MAX_EXPORT_ITEMS,
        });
        if (res.isErr()) {
          return res;
        }
        return new Ok(renderExport("customers", res.value));
      },
    }),

  export_sales: async (
    { startDate, endDate, financialStatus, fulfillmentStatus, limit },
    { authInfo }
  ) =>
    withShopifyAuth({
      authInfo,
      action: async (accessToken, shop) => {
        const res = await exportSales(accessToken, shop, {
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
    }),

  export_top_customers_by_period: async (
    { startDate, endDate, limit },
    { authInfo }
  ) =>
    withShopifyAuth({
      authInfo,
      action: async (accessToken, shop) => {
        const res = await exportTopCustomersByPeriod(accessToken, shop, {
          startDate,
          endDate,
          limit: limit ?? MAX_EXPORT_ITEMS,
        });
        if (res.isErr()) {
          return res;
        }
        return new Ok(renderExport("top customers", res.value));
      },
    }),
};

export const TOOLS = buildTools(SHOPIFY_TOOLS_METADATA, handlers);
