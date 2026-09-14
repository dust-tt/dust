import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  CustomerListResult,
  OrderListResult,
  ProductListResult,
  ShopifyCustomer,
  ShopifyCustomerState,
  ShopifyOrder,
  ShopifyProduct,
} from "@app/lib/api/actions/servers/shopify/types";
import {
  CustomerNodeSchema,
  OrderNodeSchema,
  ProductNodeSchema,
} from "@app/lib/api/actions/servers/shopify/types";
import { untrustedFetch } from "@app/lib/egress/server";
import logger from "@app/logger/logger";
import { normalizeShopifyStoreDomain } from "@app/types/oauth/lib";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";

const SHOPIFY_API_VERSION = "2026-07";
const PAGE_SIZE = 250;

const CUSTOMERS_QUERY = `
  query ListCustomers($first: Int!, $after: String, $query: String) {
    customers(first: $first, after: $after, query: $query) {
      nodes {
        id
        displayName
        firstName
        lastName
        defaultEmailAddress { emailAddress }
        defaultPhoneNumber { phoneNumber }
        state
        numberOfOrders
        amountSpent { amount currencyCode }
        tags
        createdAt
        updatedAt
        defaultAddress {
          address1
          address2
          city
          province
          provinceCode
          country
          countryCodeV2
          zip
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

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

const ORDERS_QUERY = `
  query ListOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query) {
      nodes {
        id
        name
        createdAt
        updatedAt
        cancelledAt
        displayFinancialStatus
        displayFulfillmentStatus
        currentSubtotalPriceSet { shopMoney { amount currencyCode } }
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        currentTotalTaxSet { shopMoney { amount currencyCode } }
        currentSubtotalLineItemsQuantity
        email
        tags
        customer {
          id
          displayName
          defaultEmailAddress { emailAddress }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const CustomersDataSchema = z.object({
  customers: z.object({
    nodes: z.array(CustomerNodeSchema),
    pageInfo: z.object({
      hasNextPage: z.boolean(),
      endCursor: z.string().nullable(),
    }),
  }),
});

const ProductsDataSchema = z.object({
  products: z.object({
    nodes: z.array(ProductNodeSchema),
    pageInfo: z.object({
      hasNextPage: z.boolean(),
      endCursor: z.string().nullable(),
    }),
  }),
});

const OrdersDataSchema = z.object({
  orders: z.object({
    nodes: z.array(OrderNodeSchema),
    pageInfo: z.object({
      hasNextPage: z.boolean(),
      endCursor: z.string().nullable(),
    }),
  }),
});

const GraphQLErrorSchema = z.object({ message: z.string() });

function quoteSearchValue(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export class ShopifyClient {
  constructor(
    private readonly accessToken: string,
    private readonly storeDomain: string
  ) {}

  private async fetchGraphQL<T>({
    query,
    variables,
    dataSchema,
    resourceName,
    requiredScope,
  }: {
    query: string;
    variables: Record<string, unknown>;
    dataSchema: z.ZodType<T>;
    resourceName: "customer" | "order" | "product";
    requiredScope: "read_customers" | "read_orders" | "read_products";
  }): Promise<Result<T, MCPError>> {
    const url = `https://${this.storeDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    let response: Awaited<ReturnType<typeof untrustedFetch>>;
    try {
      response = await untrustedFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": this.accessToken,
        },
        body: JSON.stringify({ query, variables }),
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
            `Shopify authentication failed. Reconnect the Shopify tool and ensure the app has the ${requiredScope} scope.`,
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

    const responseSchema = z.object({
      data: dataSchema.nullish(),
      errors: z.array(GraphQLErrorSchema).optional(),
    });
    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success) {
      logger.error(
        { error: parsed.error.message, resourceName },
        "[Shopify MCP Server] Response validation failed"
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
        { errors: errors.map((error) => error.message), resourceName },
        "[Shopify MCP Server] Partial response"
      );
    }

    return new Ok(data);
  }

  private async fetchCustomersPage({
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
        customers: ShopifyCustomer[];
        hasNextPage: boolean;
        endCursor: string | null;
      },
      MCPError
    >
  > {
    const data = await this.fetchGraphQL({
      query: CUSTOMERS_QUERY,
      variables: { first, after, query },
      dataSchema: CustomersDataSchema,
      resourceName: "customer",
      requiredScope: "read_customers",
    });
    if (data.isErr()) {
      return data;
    }

    return new Ok({
      customers: data.value.customers.nodes,
      hasNextPage: data.value.customers.pageInfo.hasNextPage,
      endCursor: data.value.customers.pageInfo.endCursor,
    });
  }

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
    const data = await this.fetchGraphQL({
      query: PRODUCTS_QUERY,
      variables: { first, after, query },
      dataSchema: ProductsDataSchema,
      resourceName: "product",
      requiredScope: "read_products",
    });
    if (data.isErr()) {
      return data;
    }

    return new Ok({
      products: data.value.products.nodes,
      hasNextPage: data.value.products.pageInfo.hasNextPage,
      endCursor: data.value.products.pageInfo.endCursor,
    });
  }

  private async fetchOrdersPage({
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
        orders: ShopifyOrder[];
        hasNextPage: boolean;
        endCursor: string | null;
      },
      MCPError
    >
  > {
    const data = await this.fetchGraphQL({
      query: ORDERS_QUERY,
      variables: { first, after, query },
      dataSchema: OrdersDataSchema,
      resourceName: "order",
      requiredScope: "read_orders",
    });
    if (data.isErr()) {
      return data;
    }

    return new Ok({
      orders: data.value.orders.nodes,
      hasNextPage: data.value.orders.pageInfo.hasNextPage,
      endCursor: data.value.orders.pageInfo.endCursor,
    });
  }

  async listCustomers({
    state,
    email,
    tag,
    searchQuery,
    limit,
  }: {
    state?: ShopifyCustomerState;
    email?: string;
    tag?: string;
    searchQuery?: string;
    limit: number;
  }): Promise<Result<CustomerListResult, MCPError>> {
    const filters: string[] = [];
    if (state) {
      filters.push(`state:${state}`);
    }
    if (email) {
      filters.push(`email:${quoteSearchValue(email)}`);
    }
    if (tag) {
      filters.push(`tag:${quoteSearchValue(tag)}`);
    }
    if (searchQuery) {
      filters.push(searchQuery);
    }

    const customers: ShopifyCustomer[] = [];
    let cursor: string | null = null;
    while (customers.length < limit) {
      const page = await this.fetchCustomersPage({
        first: Math.min(PAGE_SIZE, limit - customers.length),
        after: cursor,
        query: filters.length > 0 ? filters.join(" ") : null,
      });
      if (page.isErr()) {
        return page;
      }

      customers.push(...page.value.customers);
      if (!page.value.hasNextPage || !page.value.endCursor) {
        return new Ok({ customers });
      }
      cursor = page.value.endCursor;
    }

    return new Ok({ customers });
  }

  async listProducts({
    status,
    vendor,
    searchQuery,
    limit,
  }: {
    status?: "ACTIVE" | "DRAFT" | "ARCHIVED" | "UNLISTED";
    vendor?: string;
    searchQuery?: string;
    limit: number;
  }): Promise<Result<ProductListResult, MCPError>> {
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
    while (products.length < limit) {
      const page = await this.fetchProductsPage({
        first: Math.min(PAGE_SIZE, limit - products.length),
        after: cursor,
        query: filters.length > 0 ? filters.join(" ") : null,
      });
      if (page.isErr()) {
        return page;
      }

      products.push(...page.value.products);
      if (!page.value.hasNextPage || !page.value.endCursor) {
        return new Ok({ products });
      }
      cursor = page.value.endCursor;
    }

    return new Ok({ products });
  }

  async listOrders({
    customerId,
    searchQuery,
    limit,
  }: {
    customerId?: string;
    searchQuery?: string;
    limit: number;
  }): Promise<Result<OrderListResult, MCPError>> {
    const filters: string[] = [];
    if (customerId) {
      const customerGidMatch = /^gid:\/\/shopify\/Customer\/(\d+)$/.exec(
        customerId
      );
      filters.push(`customer_id:${customerGidMatch?.[1] ?? customerId}`);
    }
    if (searchQuery) {
      filters.push(searchQuery);
    }

    const orders: ShopifyOrder[] = [];
    let cursor: string | null = null;
    while (orders.length < limit) {
      const page = await this.fetchOrdersPage({
        first: Math.min(PAGE_SIZE, limit - orders.length),
        after: cursor,
        query: filters.length > 0 ? filters.join(" ") : null,
      });
      if (page.isErr()) {
        return page;
      }

      orders.push(...page.value.orders);
      if (!page.value.hasNextPage || !page.value.endCursor) {
        return new Ok({ orders });
      }
      cursor = page.value.endCursor;
    }

    return new Ok({ orders });
  }
}

export function createShopifyClient(
  authInfo?: AuthInfo
): Result<ShopifyClient, MCPError> {
  if (!authInfo?.token) {
    return new Err(new MCPError("No Shopify access token found."));
  }

  const storeDomain = normalizeShopifyStoreDomain(
    authInfo.extra?.shopify_store_domain
  );
  if (!storeDomain) {
    return new Err(
      new MCPError(
        "Shopify store domain not found. Reconnect the Shopify tool with a valid myshopify.com domain."
      )
    );
  }

  return new Ok(new ShopifyClient(authInfo.token, storeDomain));
}
