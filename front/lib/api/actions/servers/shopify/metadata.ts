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
    name: "export_products",
    description:
      "Export the Shopify product catalog with title, status, vendor, type, inventory, and price range.",
    schema: {
      status: z
        .enum(["ACTIVE", "DRAFT", "ARCHIVED"])
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
      running: "Exporting Shopify products",
      done: "Export Shopify products",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "export_customer_ltv",
    description:
      "Export customer lifetime value: total amount spent and order count per customer, identified by ID.",
    schema: {
      sortByAmountSpent: z
        .boolean()
        .optional()
        .describe(
          "Rank customers by lifetime amount spent, highest first (default: true). Exact for up to 1000 customers; use minAmountSpentDollars to narrow beyond that."
        ),
      minAmountSpentDollars: z
        .number()
        .nonnegative()
        .optional()
        .describe(
          "Keep only customers whose lifetime spend is at least this amount, in store currency."
        ),
      limit: limitSchema("customers"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Exporting Shopify customer LTV",
      done: "Export Shopify customer LTV",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "export_sales",
    description:
      "Export Shopify orders for a date range, with totals, taxes, and payment and fulfillment status. Without the read_all_orders scope, only the last 60 days are available.",
    schema: {
      startDate: z
        .string()
        .optional()
        .describe("ISO 8601 lower bound for order creation date (inclusive)."),
      endDate: z
        .string()
        .optional()
        .describe("ISO 8601 upper bound for order creation date (inclusive)."),
      financialStatus: z
        .enum([
          "PAID",
          "PENDING",
          "AUTHORIZED",
          "PARTIALLY_PAID",
          "PARTIALLY_REFUNDED",
          "REFUNDED",
          "VOIDED",
          "EXPIRED",
        ])
        .optional()
        .describe("Filter by payment status."),
      fulfillmentStatus: z
        .enum(["UNFULFILLED", "FULFILLED", "PARTIAL", "SCHEDULED", "ON_HOLD"])
        .optional()
        .describe("Filter by fulfillment status."),
      limit: limitSchema("orders"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Exporting Shopify sales",
      done: "Export Shopify sales",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "export_top_customers_by_period",
    description:
      "Rank the top customers by total spend over a date range, aggregated from their orders. Without the read_all_orders scope, only the last 60 days are available.",
    schema: {
      startDate: z
        .string()
        .optional()
        .describe("ISO 8601 lower bound for order creation date (inclusive)."),
      endDate: z
        .string()
        .optional()
        .describe("ISO 8601 upper bound for order creation date (inclusive)."),
      limit: limitSchema("customers"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Ranking Shopify top customers",
      done: "Rank Shopify top customers",
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
      "Export product catalog, customer lifetime value, and sales data from a Shopify store.",
    // Pilot (phase 1) uses a merchant-provided token injected via authInfo; no
    // Dust OAuth provider yet. Phase 2 will set
    // `authorization: { provider: "shopify", supported_use_cases: [...] }`.
    authorization: null,
    icon: "ActionTableIcon",
    documentationUrl: null,
  },
  tools: SHOPIFY_TOOLS_METADATA,
} as const satisfies ServerMetadata;
