import {
  createShopifyClient,
  ShopifyClient,
} from "@app/lib/api/actions/servers/shopify/client";
import type { ShopifyProduct } from "@app/lib/api/actions/servers/shopify/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  untrustedFetch: vi.fn(),
}));

vi.mock("@app/lib/egress/server", () => ({
  untrustedFetch: mocks.untrustedFetch,
}));

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

describe("ShopifyClient.exportProducts", () => {
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

    const result = await client.exportProducts({
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
    expect(result.value.truncated).toBe(false);
    expect(mocks.untrustedFetch).toHaveBeenCalledTimes(2);

    const [firstUrl, firstInit] = mocks.untrustedFetch.mock.calls[0];
    expect(firstUrl).toBe(
      "https://my-store.myshopify.com/admin/api/2026-07/graphql.json"
    );
    const firstBody = JSON.parse(firstInit.body as string);
    expect(firstBody.variables).toEqual({
      first: 3,
      after: null,
      query: "status:active vendor:'O\\'Reilly' tag:sale",
    });

    const secondBody = JSON.parse(
      mocks.untrustedFetch.mock.calls[1][1].body as string
    );
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

    const result = await client.exportProducts({ limit: 10 });

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
