import {
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
} from "@app/lib/api/actions/servers/shopify/helpers";
import { SHOPIFY_TOOLS_METADATA } from "@app/lib/api/actions/servers/shopify/metadata";
import { describe, expect, it } from "vitest";

describe("Shopify list tool metadata", () => {
  it("applies the default and maximum to every list tool", () => {
    for (const tool of SHOPIFY_TOOLS_METADATA) {
      expect(tool.schema.limit.safeParse(undefined)).toEqual({
        success: true,
        data: DEFAULT_LIST_LIMIT,
      });
      expect(tool.schema.limit.safeParse(MAX_LIST_LIMIT).success).toBe(true);
      expect(tool.schema.limit.safeParse(MAX_LIST_LIMIT + 1).success).toBe(
        false
      );
      expect(tool.schema.limit.description).toContain(
        `default: ${DEFAULT_LIST_LIMIT}, max: ${MAX_LIST_LIMIT}`
      );
    }
  });

  it("accepts Shopify customer IDs for the order filter", () => {
    const listOrders = SHOPIFY_TOOLS_METADATA.find(
      (tool) => tool.name === "list_orders"
    );
    expect(listOrders?.schema.customerId.safeParse("123").success).toBe(true);
    expect(
      listOrders?.schema.customerId.safeParse("gid://shopify/Customer/123")
        .success
    ).toBe(true);
    expect(
      listOrders?.schema.customerId.safeParse("gid://shopify/Product/123")
        .success
    ).toBe(false);
  });
});
