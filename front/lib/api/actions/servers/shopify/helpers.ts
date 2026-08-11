import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  MAX_EXPORT_ITEMS,
  paginateConnection,
  quoteSearchValue,
} from "@app/lib/api/actions/servers/shopify/client";
import type {
  ExportResult,
  ShopifyCustomer,
  ShopifyOrder,
  ShopifyProduct,
  TopCustomer,
} from "@app/lib/api/actions/servers/shopify/types";
import {
  CustomerNodeSchema,
  OrderAggNodeSchema,
  OrderNodeSchema,
  ProductNodeSchema,
} from "@app/lib/api/actions/servers/shopify/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const PRODUCT_FIELDS = `
  id
  title
  handle
  status
  vendor
  productType
  totalInventory
  createdAt
  updatedAt
  priceRangeV2 {
    minVariantPrice { amount currencyCode }
    maxVariantPrice { amount currencyCode }
  }
`;

const CUSTOMER_FIELDS = `
  id
  numberOfOrders
  amountSpent { amount currencyCode }
  createdAt
`;

const ORDER_FIELDS = `
  id
  name
  createdAt
  displayFinancialStatus
  displayFulfillmentStatus
  totalPriceSet { shopMoney { amount currencyCode } }
  subtotalPriceSet { shopMoney { amount currencyCode } }
  totalTaxSet { shopMoney { amount currencyCode } }
  customer { id }
`;

const ORDER_AGG_FIELDS = `
  id
  totalPriceSet { shopMoney { amount currencyCode } }
  customer { id }
`;

function getShopDomain(authInfo?: AuthInfo): Result<string, MCPError> {
  // Preview: no Shopify OAuth provider yet, so the shop domain is read from the
  // `X-Shopify-Shop` custom header set at setup. It will come from the OAuth
  // connection once that lands.
  const parsed = z
    .object({ "X-Shopify-Shop": z.string().trim().min(1) })
    .safeParse(authInfo?.extra?.customHeaders);
  if (!parsed.success) {
    return new Err(
      new MCPError(
        "Shopify shop domain not found. Set it as an `X-Shopify-Shop` custom header (e.g. my-store.myshopify.com)."
      )
    );
  }
  const host = parsed.data["X-Shopify-Shop"]
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!host.endsWith(".myshopify.com")) {
    return new Err(
      new MCPError(
        "Invalid Shopify shop domain. Use the store's myshopify.com domain (e.g. my-store.myshopify.com)."
      )
    );
  }
  return new Ok(host);
}

export async function exportProducts(
  accessToken: string,
  shop: string,
  {
    status,
    vendor,
    searchQuery,
    limit,
  }: {
    status?: "ACTIVE" | "DRAFT" | "ARCHIVED";
    vendor?: string;
    searchQuery?: string;
    limit: number;
  }
): Promise<Result<ExportResult<ShopifyProduct>, MCPError>> {
  const filters: string[] = [];
  if (status) {
    filters.push(`status:${status.toLowerCase()}`);
  }
  if (vendor) {
    filters.push(`vendor:${quoteSearchValue(vendor)}`);
  }
  if (searchQuery) {
    filters.push(searchQuery);
  }

  return paginateConnection({
    accessToken,
    shop,
    root: "products",
    fields: PRODUCT_FIELDS,
    filters,
    limit,
    nodeSchema: ProductNodeSchema,
  });
}

export async function exportCustomerLtv(
  accessToken: string,
  shop: string,
  {
    sortByAmountSpent,
    minAmountSpentDollars,
    limit,
  }: {
    sortByAmountSpent?: boolean;
    minAmountSpentDollars?: number;
    limit: number;
  }
): Promise<Result<ExportResult<ShopifyCustomer>, MCPError>> {
  const filters: string[] = [];
  if (minAmountSpentDollars !== undefined) {
    filters.push(`total_spent:>=${minAmountSpentDollars}`);
  }
  const wantsSort = sortByAmountSpent ?? true;
  // Shopify has no "total spent" sort key, so to return the true top lifetime
  // spenders we must fetch a wide window and rank locally. Fetching up to the
  // cap makes the ranking exact when the set fits under it (or is narrowed by
  // minAmountSpentDollars); beyond the cap it is approximate and flagged as
  // truncated.
  const fetchLimit = wantsSort ? MAX_EXPORT_ITEMS : limit;

  const res = await paginateConnection({
    accessToken,
    shop,
    root: "customers",
    fields: CUSTOMER_FIELDS,
    filters,
    limit: fetchLimit,
    nodeSchema: CustomerNodeSchema,
  });
  if (res.isErr()) {
    return res;
  }

  if (!wantsSort) {
    return res;
  }

  const sorted = [...res.value.nodes].sort(
    (a, b) => Number(b.amountSpent.amount) - Number(a.amountSpent.amount)
  );
  return new Ok({
    nodes: sorted.slice(0, limit),
    truncated: res.value.truncated,
  });
}

export async function exportSales(
  accessToken: string,
  shop: string,
  {
    startDate,
    endDate,
    financialStatus,
    fulfillmentStatus,
    limit,
  }: {
    startDate?: string;
    endDate?: string;
    financialStatus?: string;
    fulfillmentStatus?: string;
    limit: number;
  }
): Promise<Result<ExportResult<ShopifyOrder>, MCPError>> {
  const filters: string[] = [];
  if (startDate) {
    filters.push(`created_at:>='${startDate}'`);
  }
  if (endDate) {
    filters.push(`created_at:<='${endDate}'`);
  }
  if (financialStatus) {
    filters.push(`financial_status:${financialStatus.toLowerCase()}`);
  }
  if (fulfillmentStatus) {
    filters.push(`fulfillment_status:${fulfillmentStatus.toLowerCase()}`);
  }

  return paginateConnection({
    accessToken,
    shop,
    root: "orders",
    fields: ORDER_FIELDS,
    filters,
    limit,
    nodeSchema: OrderNodeSchema,
  });
}

export async function exportTopCustomersByPeriod(
  accessToken: string,
  shop: string,
  {
    startDate,
    endDate,
    limit,
  }: { startDate?: string; endDate?: string; limit: number }
): Promise<Result<ExportResult<TopCustomer>, MCPError>> {
  const filters: string[] = [];
  if (startDate) {
    filters.push(`created_at:>='${startDate}'`);
  }
  if (endDate) {
    filters.push(`created_at:<='${endDate}'`);
  }
  // Fetch every order in the window (up to the cap) so the per-customer
  // aggregation is complete. `limit` only bounds the returned ranking.
  const res = await paginateConnection({
    accessToken,
    shop,
    root: "orders",
    fields: ORDER_AGG_FIELDS,
    filters,
    limit: MAX_EXPORT_ITEMS,
    nodeSchema: OrderAggNodeSchema,
  });
  if (res.isErr()) {
    return res;
  }

  const byCustomer = new Map<
    string,
    { amountDollars: number; currencyCode: string; numberOfOrders: number }
  >();
  for (const order of res.value.nodes) {
    // Skip guest orders (no associated customer).
    if (!order.customer) {
      continue;
    }
    const amountDollars = Number(order.totalPriceSet.shopMoney.amount);
    const existing = byCustomer.get(order.customer.id);
    if (existing) {
      existing.amountDollars += amountDollars;
      existing.numberOfOrders += 1;
    } else {
      byCustomer.set(order.customer.id, {
        amountDollars,
        currencyCode: order.totalPriceSet.shopMoney.currencyCode,
        numberOfOrders: 1,
      });
    }
  }

  const ranked: TopCustomer[] = [...byCustomer.entries()]
    .map(([customerId, agg]) => ({
      customerId,
      numberOfOrders: agg.numberOfOrders,
      amountSpent: {
        amount: agg.amountDollars.toFixed(2),
        currencyCode: agg.currencyCode,
      },
    }))
    .sort((a, b) => Number(b.amountSpent.amount) - Number(a.amountSpent.amount))
    .slice(0, limit);

  // If the order fetch hit the cap, some orders were not counted, so the
  // ranking is approximate.
  return new Ok({ nodes: ranked, truncated: res.value.truncated });
}

export async function withShopifyAuth({
  authInfo,
  action,
}: {
  authInfo?: AuthInfo;
  action: (
    accessToken: string,
    shop: string
  ) => Promise<Result<CallToolResult["content"], MCPError>>;
}): Promise<Result<CallToolResult["content"], MCPError>> {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return new Err(new MCPError("No Shopify access token found."));
  }
  const shopRes = getShopDomain(authInfo);
  if (shopRes.isErr()) {
    return shopRes;
  }
  return action(accessToken, shopRes.value);
}
