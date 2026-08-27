import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
} from "@app/lib/api/actions/servers/shopify/helpers";
import {
  ShopifyCustomerIdSchema,
  ShopifyCustomerStateSchema,
} from "@app/lib/api/actions/servers/shopify/types";
import { z } from "zod";

export const SHOPIFY_SERVER_NAME = "shopify" as const;

const limitSchema = (noun: string) =>
  z
    .number()
    .int()
    .positive()
    .max(MAX_LIST_LIMIT)
    .optional()
    .default(DEFAULT_LIST_LIMIT)
    .describe(
      `Maximum number of ${noun} to return (default: ${DEFAULT_LIST_LIMIT}, max: ${MAX_LIST_LIMIT}).`
    );

export const SHOPIFY_TOOLS_METADATA = [
  {
    name: "list_customers",
    description:
      "List Shopify customers with contact details, account state, order count, total spend, tags, and default address.",
    schema: {
      state: ShopifyCustomerStateSchema.optional().describe(
        "Filter by customer account state."
      ),
      email: z
        .string()
        .optional()
        .describe("Filter by exact customer email address."),
      tag: z.string().optional().describe("Filter by exact customer tag."),
      searchQuery: z
        .string()
        .optional()
        .describe("Additional Shopify customer search query."),
      limit: limitSchema("customers"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Shopify customers",
      done: "List Shopify customers",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "list_orders",
    description:
      "List Shopify orders with buyer details, status, quantity, and current financial totals.",
    schema: {
      customerId: ShopifyCustomerIdSchema.optional().describe(
        "Filter by buyer ID. Accepts a numeric ID or the full Shopify GID."
      ),
      searchQuery: z
        .string()
        .optional()
        .describe("Additional Shopify order search query."),
      limit: limitSchema("orders"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Shopify orders",
      done: "List Shopify orders",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
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
    icon: "ShopifyLogo",
    documentationUrl: null,
  },
  tools: SHOPIFY_TOOLS_METADATA,
} as const satisfies ServerMetadata;
