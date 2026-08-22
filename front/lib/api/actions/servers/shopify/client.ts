import { MCPError } from "@app/lib/actions/mcp_errors";
import { getShopDomain } from "@app/lib/api/actions/servers/shopify/helpers";
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
  PageInfoSchema,
  ProductNodeSchema,
} from "@app/lib/api/actions/servers/shopify/types";
import { untrustedFetch } from "@app/lib/egress/server";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";

const SHOPIFY_API_VERSION = "2026-07";

// Shopify caps a connection's `first` argument at 250.
const PAGE_SIZE = 250;

// Hard cap on exported records to keep responses and API usage bounded.
export const MAX_EXPORT_ITEMS = 1000;

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

// One page of a Shopify connection, flattened to the shape `paginate` consumes.
interface Page<N> {
  nodes: N[];
  hasNextPage: boolean;
  endCursor: string | null;
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

  // We stopped with more pages available. Only flag truncation when the hard
  // cap was the binding constraint; a smaller caller `limit` means the caller
  // got exactly what they asked for.
  return new Ok({
    nodes: nodes.slice(0, cap),
    truncated: cap === MAX_EXPORT_ITEMS,
  });
}

// Owns all outbound interactions with the Shopify Admin API: it holds the access
// token and shop domain and exposes one method per export. Instantiate it via
// `createShopifyClient`, which validates the auth information.
export class ShopifyClient {
  constructor(
    private readonly accessToken: string,
    private readonly shop: string
  ) {}

  private async graphQL<T extends z.ZodTypeAny>(
    query: string,
    schema: T
  ): Promise<Result<z.infer<T>, MCPError>> {
    const url = `https://${this.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

    let response: Awaited<ReturnType<typeof untrustedFetch>>;
    try {
      response = await untrustedFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": this.accessToken,
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
      // Errors from Shopify's side (bad token, rate limit, their outages): not a
      // bug on ours, so don't report them to our observability stack.
      if (response.status === 401 || response.status === 403) {
        return new Err(
          new MCPError(
            "Shopify authentication failed. The access token may be expired or missing the required scope.",
            { tracked: false }
          )
        );
      }
      return new Err(
        new MCPError(
          `Shopify API error: ${response.status} ${response.statusText} - ${body.slice(0, 200)}`,
          { tracked: false }
        )
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(await response.text());
    } catch (err) {
      return new Err(
        new MCPError(
          `Invalid JSON from the Shopify API: ${normalizeError(err).message}`,
          { tracked: false }
        )
      );
    }

    // Shopify returns HTTP 200 with partial `data` and an `errors` array when a
    // field is redacted (e.g. missing scope / PCD). `data` is validated inline by
    // the tool schema; `nullish` keeps the "data absent + errors" case parseable
    // so we can surface the GraphQL error rather than a format error.
    const parsed = z
      .object({
        data: schema.nullish(),
        errors: z.array(z.object({ message: z.string() })).optional(),
      })
      .safeParse(json);
    if (!parsed.success) {
      logger.error(
        { error: parsed.error.message },
        "[Shopify MCP Server] Response validation failed"
      );
      return new Err(
        new MCPError(`Invalid Shopify response format: ${parsed.error.message}`)
      );
    }

    const { data, errors } = parsed.data;

    // Only fail when `data` is absent; otherwise use what we got and log the
    // redactions.
    if (data === undefined || data === null) {
      const message =
        errors?.map((e) => e.message).join("; ") ?? "Shopify returned no data.";
      // Comes from Shopify's side (e.g. redacted fields / missing scope), not a
      // bug on ours: don't report it to our observability stack.
      return new Err(
        new MCPError(`Shopify GraphQL error: ${message}`, { tracked: false })
      );
    }
    if (errors && errors.length > 0) {
      logger.warn(
        { errors: errors.map((e) => e.message) },
        "[Shopify MCP Server] Partial response with errors (likely redacted fields)"
      );
    }

    return new Ok(data);
  }

  // Paginate any Shopify connection: build the query from `root` + `fields`,
  // validate each page against `nodeSchema`, and accumulate via `paginate`.
  private async paginateConnection<T extends z.ZodTypeAny>({
    root,
    fields,
    filters,
    limit,
    nodeSchema,
  }: {
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
        const after = cursor ? `, after: ${JSON.stringify(cursor)}` : "";
        const search = filters.length
          ? `, query: ${JSON.stringify(filters.join(" "))}`
          : "";
        const query = `{
          connection: ${root}(first: ${PAGE_SIZE}${after}${search}) {
            edges { node { ${fields} } }
            pageInfo { hasNextPage endCursor }
          }
        }`;
        const res = await this.graphQL(query, schema);
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

  async exportProducts({
    status,
    vendor,
    searchQuery,
    limit,
  }: {
    status?: "ACTIVE" | "DRAFT" | "ARCHIVED";
    vendor?: string;
    searchQuery?: string;
    limit: number;
  }): Promise<Result<ExportResult<ShopifyProduct>, MCPError>> {
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

    return this.paginateConnection({
      root: "products",
      fields: PRODUCT_FIELDS,
      filters,
      limit,
      nodeSchema: ProductNodeSchema,
    });
  }

  async exportCustomerLtv({
    sortByAmountSpent,
    minAmountSpentDollars,
    limit,
  }: {
    sortByAmountSpent?: boolean;
    minAmountSpentDollars?: number;
    limit: number;
  }): Promise<Result<ExportResult<ShopifyCustomer>, MCPError>> {
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

    const res = await this.paginateConnection({
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

  async exportSales({
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
  }): Promise<Result<ExportResult<ShopifyOrder>, MCPError>> {
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

    return this.paginateConnection({
      root: "orders",
      fields: ORDER_FIELDS,
      filters,
      limit,
      nodeSchema: OrderNodeSchema,
    });
  }

  async exportTopCustomersByPeriod({
    startDate,
    endDate,
    limit,
  }: {
    startDate?: string;
    endDate?: string;
    limit: number;
  }): Promise<Result<ExportResult<TopCustomer>, MCPError>> {
    const filters: string[] = [];
    if (startDate) {
      filters.push(`created_at:>='${startDate}'`);
    }
    if (endDate) {
      filters.push(`created_at:<='${endDate}'`);
    }
    // Fetch every order in the window (up to the cap) so the per-customer
    // aggregation is complete. `limit` only bounds the returned ranking.
    const res = await this.paginateConnection({
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
      .sort(
        (a, b) => Number(b.amountSpent.amount) - Number(a.amountSpent.amount)
      )
      .slice(0, limit);

    // If the order fetch hit the cap, some orders were not counted, so the
    // ranking is approximate.
    return new Ok({ nodes: ranked, truncated: res.value.truncated });
  }
}

// Instantiate a ShopifyClient from the request auth info. Fails when the access
// token or a valid shop domain is missing.
export function createShopifyClient(
  authInfo?: AuthInfo
): Result<ShopifyClient, MCPError> {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return new Err(new MCPError("No Shopify access token found."));
  }
  const shopRes = getShopDomain(authInfo);
  if (shopRes.isErr()) {
    return shopRes;
  }
  return new Ok(new ShopifyClient(accessToken, shopRes.value));
}
