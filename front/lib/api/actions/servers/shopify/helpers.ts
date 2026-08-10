import { MCPError } from "@app/lib/actions/mcp_errors";
import { untrustedFetch } from "@app/lib/egress/server";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const SHOPIFY_API_VERSION = "2026-07";

// Shopify caps a connection's `first` argument at 250.
const PAGE_SIZE = 250;

// Hard cap on exported records to keep responses and API usage bounded.
export const MAX_EXPORT_ITEMS = 1000;

const MoneySchema = z.object({
  amount: z.string(),
  currencyCode: z.string(),
});
const MoneyBagSchema = z.object({ shopMoney: MoneySchema });

const PageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
});

const ProductNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  handle: z.string(),
  status: z.string(),
  vendor: z.string(),
  productType: z.string(),
  totalInventory: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  priceRangeV2: z.object({
    minVariantPrice: MoneySchema,
    maxVariantPrice: MoneySchema,
  }),
});
export type ShopifyProduct = z.infer<typeof ProductNodeSchema>;

// Customer lifetime value: level 1 (non-identifying) data only, identified by
// ID. Name/email/phone are protected customer fields (PCD level 2) and are
// intentionally not requested.
const CustomerNodeSchema = z.object({
  id: z.string(),
  // Shopify serializes numberOfOrders (UnsignedInt64) as a string.
  numberOfOrders: z.union([z.string(), z.number()]),
  amountSpent: MoneySchema,
  createdAt: z.string(),
});
export type ShopifyCustomer = z.infer<typeof CustomerNodeSchema>;

const OrderNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  displayFinancialStatus: z.string().nullable(),
  displayFulfillmentStatus: z.string(),
  totalPriceSet: MoneyBagSchema,
  subtotalPriceSet: MoneyBagSchema.nullable(),
  totalTaxSet: MoneyBagSchema.nullable(),
  // Reference the customer by ID only (no PII).
  customer: z.object({ id: z.string() }).nullable(),
});
export type ShopifyOrder = z.infer<typeof OrderNodeSchema>;

// Minimal order shape used to aggregate spend per customer over a period.
const OrderAggNodeSchema = z.object({
  id: z.string(),
  totalPriceSet: MoneyBagSchema,
  customer: z.object({ id: z.string() }).nullable(),
});

export interface TopCustomer {
  customerId: string;
  numberOfOrders: number;
  amountSpent: { amount: string; currencyCode: string };
}

function getShopDomain(authInfo?: AuthInfo): Result<string, MCPError> {
  // Phase 1: the shop domain is passed as an `X-Shopify-Shop` custom header set
  // manually by the merchant. Phase 2 (OAuth) will source it from the connection
  // metadata instead, so this custom-header path is temporary.
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
  return new Ok(
    host.endsWith(".myshopify.com") ? host : `${host}.myshopify.com`
  );
}

async function shopifyGraphQL<T extends z.ZodTypeAny>(
  {
    accessToken,
    shop,
    query,
  }: {
    accessToken: string;
    shop: string;
    query: string;
  },
  schema: T
): Promise<Result<z.infer<T>, MCPError>> {
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  let response: Awaited<ReturnType<typeof untrustedFetch>>;
  try {
    response = await untrustedFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query }),
    });
  } catch (err) {
    return new Err(
      new MCPError(
        `Failed to reach the Shopify API: ${normalizeError(err).message}`
      )
    );
  }

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401 || response.status === 403) {
      return new Err(
        new MCPError(
          "Shopify authentication failed. The access token may be expired or missing the required scope."
        )
      );
    }
    return new Err(
      new MCPError(
        `Shopify API error: ${response.status} ${response.statusText} - ${body.slice(0, 200)}`
      )
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(await response.text());
  } catch (err) {
    return new Err(
      new MCPError(
        `Invalid JSON from the Shopify API: ${normalizeError(err).message}`
      )
    );
  }

  const envelope = z
    .object({
      data: z.unknown().optional(),
      errors: z.array(z.object({ message: z.string() })).optional(),
    })
    .safeParse(json);
  if (!envelope.success) {
    return new Err(new MCPError("Unexpected Shopify API response shape."));
  }

  const { data, errors } = envelope.data;

  // Shopify returns HTTP 200 with partial `data` and an `errors` array when a
  // field is redacted (e.g. missing scope / PCD). Only fail when `data` is
  // absent; otherwise use what we got and log the redactions.
  if (data === undefined || data === null) {
    const message =
      errors?.map((e) => e.message).join("; ") ?? "Shopify returned no data.";
    return new Err(new MCPError(`Shopify GraphQL error: ${message}`));
  }
  if (errors && errors.length > 0) {
    logger.warn(
      { errors: errors.map((e) => e.message) },
      "[Shopify MCP Server] Partial response with errors (likely redacted fields)"
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    logger.error(
      { error: parsed.error.message },
      "[Shopify MCP Server] Response validation failed"
    );
    return new Err(
      new MCPError(`Invalid Shopify response format: ${parsed.error.message}`)
    );
  }
  return new Ok(parsed.data);
}

export interface ExportResult<N> {
  nodes: N[];
  truncated: boolean;
}

// One page of a Shopify connection, flattened to the shape `paginate` consumes.
interface Page<N> {
  nodes: N[];
  hasNextPage: boolean;
  endCursor: string | null;
}

async function paginate<N>({
  limit,
  runPage,
}: {
  limit: number;
  runPage: (cursor: string | null) => Promise<Result<Page<N>, MCPError>>;
}): Promise<Result<ExportResult<N>, MCPError>> {
  const cap = Math.min(limit, MAX_EXPORT_ITEMS);
  const nodes: N[] = [];
  let cursor: string | null = null;

  while (nodes.length < cap) {
    const pageRes = await runPage(cursor);
    if (pageRes.isErr()) {
      return pageRes;
    }
    const page = pageRes.value;
    nodes.push(...page.nodes);
    if (!page.hasNextPage || !page.endCursor) {
      return new Ok({ nodes: nodes.slice(0, cap), truncated: false });
    }
    cursor = page.endCursor;
  }

  return new Ok({ nodes: nodes.slice(0, cap), truncated: true });
}

function afterArg(cursor: string | null): string {
  return cursor ? `, after: ${JSON.stringify(cursor)}` : "";
}

function queryArg(filters: string[]): string {
  return filters.length ? `, query: ${JSON.stringify(filters.join(" "))}` : "";
}

// Wrap a value in single quotes for the Shopify search syntax so values with
// spaces are matched as a whole. Escape backslashes before quotes so the
// ordering does not double-escape.
function quoteSearchValue(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

// A Shopify connection response, aliased to a fixed `connection` key so a single
// generic helper can extract it type-safely regardless of the root field.
function connectionSchema<T extends z.ZodTypeAny>(node: T) {
  return z.object({
    connection: z.object({
      edges: z.array(z.object({ node })),
      pageInfo: PageInfoSchema,
    }),
  });
}

// Paginate any Shopify connection: build the query from `root` + `fields`,
// validate each page against `nodeSchema`, and accumulate via `paginate`.
async function paginateConnection<T extends z.ZodTypeAny>({
  accessToken,
  shop,
  root,
  fields,
  filters,
  limit,
  nodeSchema,
}: {
  accessToken: string;
  shop: string;
  root: "products" | "customers" | "orders";
  fields: string;
  filters: string[];
  limit: number;
  nodeSchema: T;
}): Promise<Result<ExportResult<z.infer<T>>, MCPError>> {
  const schema = connectionSchema(nodeSchema);
  return paginate<z.infer<T>>({
    limit,
    runPage: async (cursor) => {
      const query = `{
        connection: ${root}(first: ${PAGE_SIZE}${afterArg(cursor)}${queryArg(filters)}) {
          edges { node { ${fields} } }
          pageInfo { hasNextPage endCursor }
        }
      }`;
      const res = await shopifyGraphQL({ accessToken, shop, query }, schema);
      if (res.isErr()) {
        return res;
      }
      const { edges, pageInfo } = res.value.connection;
      return new Ok({
        nodes: edges.map((e) => e.node),
        hasNextPage: pageInfo.hasNextPage,
        endCursor: pageInfo.endCursor,
      });
    },
  });
}

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
    minAmountSpent,
    limit,
  }: {
    sortByAmountSpent?: boolean;
    minAmountSpent?: number;
    limit: number;
  }
): Promise<Result<ExportResult<ShopifyCustomer>, MCPError>> {
  const filters: string[] = [];
  if (minAmountSpent !== undefined) {
    filters.push(`total_spent:>=${minAmountSpent}`);
  }
  const wantsSort = sortByAmountSpent ?? true;
  // Shopify has no "total spent" sort key, so to return the true top lifetime
  // spenders we must fetch a wide window and rank locally. Fetching up to the
  // cap makes the ranking exact when the set fits under it (or is narrowed by
  // minAmountSpent); beyond the cap it is approximate and flagged as truncated.
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
    { amount: number; currencyCode: string; numberOfOrders: number }
  >();
  for (const order of res.value.nodes) {
    // Skip guest orders (no associated customer).
    if (!order.customer) {
      continue;
    }
    const amount = Number(order.totalPriceSet.shopMoney.amount);
    const existing = byCustomer.get(order.customer.id);
    if (existing) {
      existing.amount += amount;
      existing.numberOfOrders += 1;
    } else {
      byCustomer.set(order.customer.id, {
        amount,
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
        amount: agg.amount.toFixed(2),
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
