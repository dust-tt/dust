import { MCPError } from "@app/lib/actions/mcp_errors";
import { MAX_EXPORT_ITEMS } from "@app/lib/api/actions/servers/shopify/helpers";
import type {
  ProductExportResult,
  ShopifyProduct,
} from "@app/lib/api/actions/servers/shopify/types";
import { ProductNodeSchema } from "@app/lib/api/actions/servers/shopify/types";
import { untrustedFetch } from "@app/lib/egress/server";
import logger from "@app/logger/logger";
import { normalizeShopifyShopDomain } from "@app/types/oauth/lib";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";

const SHOPIFY_API_VERSION = "2026-07";
const PAGE_SIZE = 250;

const PRODUCTS_QUERY = `
  query ListProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      nodes {
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
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const ProductsDataSchema = z.object({
  products: z.object({
    nodes: z.array(ProductNodeSchema),
    pageInfo: z.object({
      hasNextPage: z.boolean(),
      endCursor: z.string().nullable(),
    }),
  }),
});

const ProductsResponseSchema = z.object({
  data: ProductsDataSchema.nullish(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

function quoteSearchValue(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export class ShopifyClient {
  constructor(
    private readonly accessToken: string,
    private readonly shop: string
  ) {}

  private async fetchProductsPage({
    first,
    after,
    query,
  }: {
    first: number;
    after: string | null;
    query: string | null;
  }): Promise<
    Result<
      {
        products: ShopifyProduct[];
        hasNextPage: boolean;
        endCursor: string | null;
      },
      MCPError
    >
  > {
    const url = `https://${this.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    let response: Awaited<ReturnType<typeof untrustedFetch>>;
    try {
      response = await untrustedFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": this.accessToken,
        },
        body: JSON.stringify({
          query: PRODUCTS_QUERY,
          variables: { first, after, query },
        }),
      });
    } catch (error) {
      return new Err(
        new MCPError(
          `Failed to reach the Shopify API: ${normalizeError(error).message}`
        )
      );
    }

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 401 || response.status === 403) {
        return new Err(
          new MCPError(
            "Shopify authentication failed. Reconnect the Shopify tool and ensure the app has the read_products scope.",
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

    let payload: unknown;
    try {
      payload = JSON.parse(await response.text());
    } catch (error) {
      return new Err(
        new MCPError(
          `Invalid JSON from the Shopify API: ${normalizeError(error).message}`,
          { tracked: false }
        )
      );
    }

    const parsed = ProductsResponseSchema.safeParse(payload);
    if (!parsed.success) {
      logger.error(
        { error: parsed.error.message },
        "[Shopify MCP Server] Product response validation failed"
      );
      return new Err(
        new MCPError(`Invalid Shopify response format: ${parsed.error.message}`)
      );
    }

    const { data, errors } = parsed.data;
    if (!data) {
      return new Err(
        new MCPError(
          `Shopify GraphQL error: ${errors?.map((error) => error.message).join("; ") ?? "Shopify returned no data."}`,
          { tracked: false }
        )
      );
    }
    if (errors?.length) {
      logger.warn(
        { errors: errors.map((error) => error.message) },
        "[Shopify MCP Server] Partial product response"
      );
    }

    return new Ok({
      products: data.products.nodes,
      hasNextPage: data.products.pageInfo.hasNextPage,
      endCursor: data.products.pageInfo.endCursor,
    });
  }

  async exportProducts({
    status,
    vendor,
    searchQuery,
    limit,
  }: {
    status?: "ACTIVE" | "DRAFT" | "ARCHIVED" | "UNLISTED";
    vendor?: string;
    searchQuery?: string;
    limit: number;
  }): Promise<Result<ProductExportResult, MCPError>> {
    const cap = Math.min(limit, MAX_EXPORT_ITEMS);
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

    const products: ShopifyProduct[] = [];
    let cursor: string | null = null;
    while (products.length < cap) {
      const page = await this.fetchProductsPage({
        first: Math.min(PAGE_SIZE, cap - products.length),
        after: cursor,
        query: filters.length > 0 ? filters.join(" ") : null,
      });
      if (page.isErr()) {
        return page;
      }

      products.push(...page.value.products);
      if (!page.value.hasNextPage || !page.value.endCursor) {
        return new Ok({ products: products.slice(0, cap), truncated: false });
      }
      cursor = page.value.endCursor;
    }

    return new Ok({
      products: products.slice(0, cap),
      truncated: cap === MAX_EXPORT_ITEMS,
    });
  }
}

export function createShopifyClient(
  authInfo?: AuthInfo
): Result<ShopifyClient, MCPError> {
  if (!authInfo?.token) {
    return new Err(new MCPError("No Shopify access token found."));
  }

  const shop = normalizeShopifyShopDomain(authInfo.extra?.shopify_shop);
  if (!shop) {
    return new Err(
      new MCPError(
        "Shopify store domain not found. Reconnect the Shopify tool with a valid myshopify.com domain."
      )
    );
  }

  return new Ok(new ShopifyClient(authInfo.token, shop));
}
