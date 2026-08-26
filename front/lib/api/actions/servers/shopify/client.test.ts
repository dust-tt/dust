import {
  createShopifyClient,
  ShopifyClient,
} from "@app/lib/api/actions/servers/shopify/client";
import type {
  ShopifyCustomer,
  ShopifyProduct,
} from "@app/lib/api/actions/servers/shopify/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  untrustedFetch: vi.fn(),
}));

vi.mock("@app/lib/egress/server", () => ({
  untrustedFetch: mocks.untrustedFetch,
}));

const ShopifyRequestBodySchema = z.object({
  query: z.string(),
  variables: z.object({
    first: z.number(),
    after: z.string().nullable(),
    query: z.string().nullable(),
  }),
});

function parseRequestBody(init: RequestInit) {
  if (typeof init.body !== "string") {
    throw new Error("Expected Shopify request body to be a string.");
  }

  return ShopifyRequestBodySchema.parse(JSON.parse(init.body));
}

function customer(id: number): ShopifyCustomer {
  return {
    id: `gid://shopify/Customer/${id}`,
    displayName: `Customer ${id}`,
    firstName: "Customer",
    lastName: `${id}`,
    defaultEmailAddress: { emailAddress: `customer-${id}@example.com` },
    defaultPhoneNumber: { phoneNumber: "+33123456789" },
    state: "ENABLED",
    numberOfOrders: `${id}`,
    amountSpent: { amount: `${id * 10}.00`, currencyCode: "EUR" },
    tags: ["VIP"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    defaultAddress: {
      address1: "1 Dust Avenue",
      address2: null,
      city: "Paris",
      province: null,
      provinceCode: null,
      country: "France",
      countryCodeV2: "FR",
      zip: "75001",
    },
  };
}

function product(id: number): ShopifyProduct {
  return {
    id: `gid://shopify/Product/${id}`,
    title: `Product ${id}`,
    handle: `product-${id}`,
    status: "ACTIVE",
    vendor: "Dust",
    productType: "Software",
    totalInventory: id,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    priceRangeV2: {
      minVariantPrice: { amount: "10.00", currencyCode: "USD" },
      maxVariantPrice: { amount: "20.00", currencyCode: "USD" },
    },
  };
}

function pageResponse(
  products: ShopifyProduct[],
  { hasNextPage, endCursor }: { hasNextPage: boolean; endCursor: string | null }
) {
  return new Response(
    JSON.stringify({
      data: {
        products: { nodes: products, pageInfo: { hasNextPage, endCursor } },
      },
    }),
    { status: 200 }
  );
}

function customerPageResponse(
  customers: ShopifyCustomer[],
  { hasNextPage, endCursor }: { hasNextPage: boolean; endCursor: string | null }
) {
  return new Response(
    JSON.stringify({
      data: {
        customers: { nodes: customers, pageInfo: { hasNextPage, endCursor } },
      },
    }),
    { status: 200 }
  );
}

describe("ShopifyClient.listCustomers", () => {
  beforeEach(() => {
    mocks.untrustedFetch.mockReset();
  });

  it("paginates customers up to the requested limit and sends filters as variables", async () => {
    mocks.untrustedFetch
      .mockResolvedValueOnce(
        customerPageResponse([customer(1), customer(2)], {
          hasNextPage: true,
          endCursor: "cursor-2",
        })
      )
      .mockResolvedValueOnce(
        customerPageResponse([customer(3)], {
          hasNextPage: false,
          endCursor: null,
        })
      );
    const client = new ShopifyClient("access-token", "my-store.myshopify.com");

    const result = await client.listCustomers({
      state: "ENABLED",
      email: "jane.o'reilly@example.com",
      tag: "VIP Customers",
      searchQuery: "country:FR",
      limit: 3,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.customers).toHaveLength(3);
    expect(mocks.untrustedFetch).toHaveBeenCalledTimes(2);

    const [firstUrl, firstInit] = mocks.untrustedFetch.mock.calls[0];
    expect(firstUrl).toBe(
      "https://my-store.myshopify.com/admin/api/2026-07/graphql.json"
    );
    const firstBody = parseRequestBody(firstInit);
    expect(firstBody.query).toContain("query ListCustomers");
    expect(firstBody.variables).toEqual({
      first: 3,
      after: null,
      query:
        "state:ENABLED email:'jane.o\\'reilly@example.com' tag:'VIP Customers' country:FR",
    });

    const secondBody = parseRequestBody(mocks.untrustedFetch.mock.calls[1][1]);
    expect(secondBody.variables).toMatchObject({
      first: 1,
      after: "cursor-2",
    });
  });

  it("identifies the required customer scope when authentication fails", async () => {
    mocks.untrustedFetch.mockResolvedValueOnce(
      new Response("Forbidden", { status: 403 })
    );
    const client = new ShopifyClient("access-token", "my-store.myshopify.com");

    const result = await client.listCustomers({ limit: 10 });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("read_customers scope");
    }
  });
});

describe("ShopifyClient.listProducts", () => {
  beforeEach(() => {
    mocks.untrustedFetch.mockReset();
  });

  it("paginates products up to the requested limit and sends filters as variables", async () => {
    mocks.untrustedFetch
      .mockResolvedValueOnce(
        pageResponse([product(1), product(2)], {
          hasNextPage: true,
          endCursor: "cursor-2",
        })
      )
      .mockResolvedValueOnce(
        pageResponse([product(3)], {
          hasNextPage: false,
          endCursor: null,
        })
      );
    const client = new ShopifyClient("access-token", "my-store.myshopify.com");

    const result = await client.listProducts({
      status: "ACTIVE",
      vendor: "O'Reilly",
      searchQuery: "tag:sale",
      limit: 3,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.products).toHaveLength(3);
    expect(mocks.untrustedFetch).toHaveBeenCalledTimes(2);

    const [firstUrl, firstInit] = mocks.untrustedFetch.mock.calls[0];
    expect(firstUrl).toBe(
      "https://my-store.myshopify.com/admin/api/2026-07/graphql.json"
    );
    const firstBody = parseRequestBody(firstInit);
    expect(firstBody.variables).toEqual({
      first: 3,
      after: null,
      query: "status:active vendor:'O\\'Reilly' tag:sale",
    });

    const secondBody = parseRequestBody(mocks.untrustedFetch.mock.calls[1][1]);
    expect(secondBody.variables).toMatchObject({
      first: 1,
      after: "cursor-2",
    });
  });

  it("surfaces GraphQL errors returned with no data", async () => {
    mocks.untrustedFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: null,
          errors: [{ message: "Access denied for products field." }],
        }),
        { status: 200 }
      )
    );
    const client = new ShopifyClient("access-token", "my-store.myshopify.com");

    const result = await client.listProducts({ limit: 10 });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "Access denied for products field"
      );
    }
  });
});

describe("createShopifyClient", () => {
  it("requires the OAuth token and store metadata", () => {
    expect(createShopifyClient().isErr()).toBe(true);
    expect(
      createShopifyClient({
        token: "access-token",
        clientId: "",
        scopes: [],
        extra: { shopify_store_domain: "not-shopify.example.com" },
      }).isErr()
    ).toBe(true);
    expect(
      createShopifyClient({
        token: "access-token",
        clientId: "",
        scopes: [],
        extra: { shopify_store_domain: "my-store.myshopify.com" },
      }).isOk()
    ).toBe(true);
  });
});
