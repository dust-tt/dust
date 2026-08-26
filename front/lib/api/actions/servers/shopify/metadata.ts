import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const SHOPIFY_SERVER_NAME = "shopify" as const;

const limitSchema = (noun: string) =>
  z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .describe(`Maximum number of ${noun} to return (max 1000).`);

export const SHOPIFY_TOOLS_METADATA = [
  {
    name: "list_products",
    description:
      "List the Shopify product catalog with title, status, vendor, type, inventory, and price range.",
    schema: {
      status: z
        .enum(["ACTIVE", "DRAFT", "ARCHIVED", "UNLISTED"])
        .optional()
        .describe("Filter by product status."),
      vendor: z.string().optional().describe("Filter by exact vendor name."),
      searchQuery: z
        .string()
        .optional()
        .describe("Free text search over the catalog (title, SKU, tag)."),
      limit: limitSchema("products"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Shopify products",
      done: "List Shopify products",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
] as const;

export const SHOPIFY_SERVER = {
  serverInfo: {
    name: SHOPIFY_SERVER_NAME,
    version: "1.0.0",
    description:
      "Access catalog, customers and orders data from a Shopify store.",
    authorization: {
      provider: "shopify" as const,
      supported_use_cases: ["platform_actions"] as const,
    },
    icon: "ActionStoreIcon",
    documentationUrl: null,
  },
  tools: SHOPIFY_TOOLS_METADATA,
} as const satisfies ServerMetadata;
