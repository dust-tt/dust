/**
 * Metronome Sandbox Setup — idempotent TypeScript script using the official SDK.
 *
 * Fetches existing metrics/products/rate cards/packages from Metronome,
 * compares by name, archives stale ones, creates missing ones.
 * Cascading: if a metric is recreated, dependent products are also recreated,
 * which cascades to rate cards, then packages.
 *
 * Run with: npx tsx scripts/metronome_setup.ts
 * Requires: METRONOME_API_KEY env var
 */

import { getMetronomeClient } from "@app/lib/metronome/client";

if (!process.env.METRONOME_API_KEY) {
  console.error("METRONOME_API_KEY env var required");
  process.exit(1);
}

const ENV =
  process.env.METRONOME_ENV === "production" ? "production" : "sandbox";

const client = getMetronomeClient();

// Credit type IDs per environment (created via Metronome UI, not API-manageable).
const CREDIT_TYPES = {
  sandbox: {
    USD: "2714e483-4ff1-48e4-9e25-ac732e8f24f2",
    AWU: "1ad632f0-4e5a-44d6-a1bf-aa6f6bc550d8",
  },
  production: {
    USD: "2714e483-4ff1-48e4-9e25-ac732e8f24f2",
    AWU: "e53a841e-b741-4bc3-8148-f377c1fb2501",
  },
} as const;

const USD_CREDIT_TYPE_ID = CREDIT_TYPES[ENV].USD;
const AWU_CREDIT_TYPE_ID = CREDIT_TYPES[ENV].AWU;

// ---------------------------------------------------------------------------
// Types for desired state definitions
// ---------------------------------------------------------------------------

interface MetricDef {
  name: string;
  event_type_filter: { in_values: string[] };
  property_filters: Array<{
    name: string;
    exists?: boolean;
    in_values?: string[];
  }>;
  aggregation_type: "SUM" | "COUNT" | "max";
  aggregation_key?: string;
  group_keys?: string[][];
}

interface ProductDef {
  name: string;
  type: "USAGE" | "SUBSCRIPTION" | "FIXED";
  billable_metric_name?: string;
  quantity_conversion?: {
    conversion_factor: number;
    operation: "DIVIDE" | "MULTIPLY";
  };
  quantity_rounding?: {
    decimal_places: number;
    rounding_method: "ROUND_UP" | "ROUND_DOWN" | "ROUND_HALF_UP";
  };
  pricing_group_key?: string[];
  presentation_group_key?: string[];
  tags?: string[];
}

interface RateDef {
  product_name: string;
  starting_at: string;
  entitled: boolean;
  rate_type: string;
  price: number;
  billing_frequency?: string;
  credit_type_id?: string;
  pricing_group_values?: Record<string, string>;
}

interface RateCardDef {
  name: string;
  description: string;
  aliases: Array<{ name: string }>;
  fiat_credit_type_id: string;
  credit_type_conversions?: Array<{
    custom_credit_type_id: string;
    fiat_per_custom_credit: number;
  }>;
  rates: RateDef[];
}

interface PackageSubscription {
  temporary_id: string;
  product_name: string; // resolved to product ID at runtime
  billing_frequency: "MONTHLY" | "QUARTERLY" | "ANNUAL" | "WEEKLY";
  collection_schedule: "ADVANCE" | "ARREARS";
  quantity_management_mode: "SEAT_BASED" | "MANUAL";
  seat_config?: { seat_group_key: string };
  proration?: {
    is_prorated: boolean;
    invoice_behavior?: "BILL_IMMEDIATELY" | "BILL_ON_NEXT_COLLECTION_DATE";
  };
}

interface PackageDef {
  // Base name without version suffix. Version is auto-computed at sync time.
  name: string;
  aliases: Array<{ name: string }>;
  rate_card_name: string;
  subscriptions?: PackageSubscription[];
  // Billing cycle anchored to contract start date (matches Stripe subscription anniversary).
  billing_anchor_date?: "contract_start_date" | "first_billing_period";
  usage_statement_schedule?: {
    frequency: "MONTHLY" | "QUARTERLY" | "ANNUAL" | "WEEKLY";
    day?: "CONTRACT_START" | "FIRST_OF_MONTH";
  };
}

// ---------------------------------------------------------------------------
// Desired state
// ---------------------------------------------------------------------------

const METRICS: MetricDef[] = [
  {
    name: "LLM Provider Cost (Programmatic)",
    event_type_filter: { in_values: ["llm_usage"] },
    property_filters: [
      { name: "cost_micro_usd", exists: true },
      { name: "is_programmatic_usage", in_values: ["true"] },
    ],
    aggregation_type: "SUM",
    aggregation_key: "cost_micro_usd",
  },
  {
    name: "LLM Provider Cost (User)",
    event_type_filter: { in_values: ["llm_usage"] },
    property_filters: [
      { name: "cost_micro_usd", exists: true },
      { name: "is_programmatic_usage", in_values: ["false"] },
    ],
    aggregation_type: "SUM",
    aggregation_key: "cost_micro_usd",
  },
  {
    name: "Tool Invocations (Programmatic)",
    event_type_filter: { in_values: ["tool_use"] },
    property_filters: [
      { name: "count", exists: true },
      { name: "is_programmatic_usage", in_values: ["true"] },
      { name: "tool_category", exists: true },
      { name: "tool_group", exists: true },
    ],
    aggregation_type: "SUM",
    aggregation_key: "count",
    group_keys: [["tool_category", "tool_group"]],
  },
  {
    name: "Tool Invocations (User)",
    event_type_filter: { in_values: ["tool_use"] },
    property_filters: [
      { name: "count", exists: true },
      { name: "is_programmatic_usage", in_values: ["false"] },
      { name: "tool_category", exists: true },
      { name: "tool_group", exists: true },
    ],
    aggregation_type: "SUM",
    aggregation_key: "count",
    group_keys: [["tool_category", "tool_group"]],
  },
  {
    name: "Registered Users",
    event_type_filter: { in_values: ["workspace_gauge"] },
    property_filters: [{ name: "member_count", exists: true }],
    aggregation_type: "max",
    aggregation_key: "member_count",
  },
  {
    name: "MAU (1+ messages)",
    event_type_filter: { in_values: ["workspace_gauge"] },
    property_filters: [{ name: "mau_1_count", exists: true }],
    aggregation_type: "max",
    aggregation_key: "mau_1_count",
  },
  {
    name: "MAU (5+ messages)",
    event_type_filter: { in_values: ["workspace_gauge"] },
    property_filters: [{ name: "mau_5_count", exists: true }],
    aggregation_type: "max",
    aggregation_key: "mau_5_count",
  },
  {
    name: "MAU (10+ messages)",
    event_type_filter: { in_values: ["workspace_gauge"] },
    property_filters: [{ name: "mau_10_count", exists: true }],
    aggregation_type: "max",
    aggregation_key: "mau_10_count",
  },
  // Phase 2 token metrics removed — will be added when Pricing Index is ready.
];

// Tag shared by all AI/Tool usage products — use `applicable_product_tags: ["usage"]`
// on credits/commits to apply them to all usage products at once.
const USAGE_TAG = "usage";

const PRODUCTS: ProductDef[] = [
  // --- Legacy usage product (USD, 30% markup baked into quantity_conversion) ---
  {
    name: "Programmatic Usage",
    type: "USAGE",
    billable_metric_name: "LLM Provider Cost (Programmatic)",
    // Convert cost_micro_usd to billable USD: multiply by 1.3 (30% markup) / 1_000_000 (micro→USD).
    // The rate card prices at $1.00/unit so the final amount equals the marked-up cost.
    quantity_conversion: {
      conversion_factor: 1.3 / 1_000_000,
      operation: "MULTIPLY",
    },
    // Round up to cents (2 decimal places) — never undercharge.
    quantity_rounding: { decimal_places: 2, rounding_method: "ROUND_UP" },
    tags: [USAGE_TAG],
  },
  // --- New pricing usage products (AWU) ---
  // 1 AWU = $0.01. AI Usage: cost_micro_usd / 10_000 = AWU (100 AWU per dollar of cost).
  // Tool Usage: count × tool_weight = AWU (weight configured per tool category in rate card).
  {
    name: "AI Usage (User)",
    type: "USAGE",
    billable_metric_name: "LLM Provider Cost (User)",
    quantity_conversion: { conversion_factor: 10_000, operation: "DIVIDE" },
    tags: [USAGE_TAG],
  },
  {
    name: "AI Usage (Programmatic)",
    type: "USAGE",
    billable_metric_name: "LLM Provider Cost (Programmatic)",
    quantity_conversion: { conversion_factor: 10_000, operation: "DIVIDE" },
    tags: [USAGE_TAG],
  },
  {
    name: "Tool Usage (Programmatic)",
    type: "USAGE",
    billable_metric_name: "Tool Invocations (Programmatic)",
    pricing_group_key: ["tool_category"],
    presentation_group_key: ["tool_group"],
    tags: [USAGE_TAG],
  },
  {
    name: "Tool Usage (User)",
    type: "USAGE",
    billable_metric_name: "Tool Invocations (User)",
    pricing_group_key: ["tool_category"],
    presentation_group_key: ["tool_group"],
    tags: [USAGE_TAG],
  },
  // Legacy seat product — SUBSCRIPTION type, managed via Metronome seat subscriptions.
  // Seats synced from membership create/revoke hooks (same as new pricing).
  {
    name: "Workspace Seat",
    type: "SUBSCRIPTION",
  },
  // MAU products — USAGE on MAX gauge, billed once at end of period.
  {
    name: "MAU Billing (1+)",
    type: "USAGE",
    billable_metric_name: "MAU (1+ messages)",
  },
  {
    name: "MAU Billing (5+)",
    type: "USAGE",
    billable_metric_name: "MAU (5+ messages)",
  },
  {
    name: "MAU Billing (10+)",
    type: "USAGE",
    billable_metric_name: "MAU (10+ messages)",
  },
  // FIXED products for credit grants — separate products for distinct invoice line items.
  {
    name: "Free Monthly Credits",
    type: "FIXED",
  },
  {
    name: "Prepaid Commit",
    type: "FIXED",
  },
  {
    name: "PAYG Overage",
    type: "FIXED",
  },
];

const RATE_CARDS: RateCardDef[] = [
  {
    name: "Legacy Pro $29",
    description:
      "Grandfathered Pro plan. $29/seat via seat subscription. AI usage 30% markup.",
    aliases: [{ name: "legacy-pro-monthly" }],
    fiat_credit_type_id: USD_CREDIT_TYPE_ID,
    rates: [
      {
        product_name: "Workspace Seat",
        starting_at: "2026-04-01T00:00:00.000Z",
        entitled: true,
        rate_type: "FLAT",
        price: 2900,
        billing_frequency: "MONTHLY",
      },
      {
        product_name: "Programmatic Usage",
        starting_at: "2026-04-01T00:00:00.000Z",
        entitled: true,
        rate_type: "FLAT",
        price: 100,
      },
    ],
  },
  {
    name: "Legacy Business $45",
    description:
      "Grandfathered Business plan. $45/seat via seat subscription. AI usage 30% markup.",
    aliases: [{ name: "legacy-business" }],
    fiat_credit_type_id: USD_CREDIT_TYPE_ID,
    rates: [
      {
        product_name: "Workspace Seat",
        starting_at: "2026-04-01T00:00:00.000Z",
        entitled: true,
        rate_type: "FLAT",
        price: 4500,
        billing_frequency: "MONTHLY",
      },
      {
        product_name: "Programmatic Usage",
        starting_at: "2026-04-01T00:00:00.000Z",
        entitled: true,
        rate_type: "FLAT",
        price: 100,
      },
    ],
  },
  {
    name: "Legacy Pro $27 Annual",
    description:
      "Grandfathered Pro plan (annual). $27/seat/month billed monthly. AI usage 30% markup.",
    aliases: [{ name: "legacy-pro-annual" }],
    fiat_credit_type_id: USD_CREDIT_TYPE_ID,
    rates: [
      {
        product_name: "Workspace Seat",
        starting_at: "2026-04-01T00:00:00.000Z",
        entitled: true,
        rate_type: "FLAT",
        price: 2700,
        billing_frequency: "MONTHLY",
      },
      {
        product_name: "Programmatic Usage",
        starting_at: "2026-04-01T00:00:00.000Z",
        entitled: true,
        rate_type: "FLAT",
        price: 100,
      },
    ],
  },
  // --- Example: New Business plan with AWU-based usage pricing ---
  // Seats in USD, AI/Tool usage in AWU (1 AWU = $0.01).
  // This is a template — uncomment and adjust when new pricing goes live.
  // {
  //   name: "Business Plan",
  //   description: "New Business plan. Pro/Max seats in USD, usage in AWU.",
  //   aliases: [{ name: "business-plan" }],
  //   fiat_credit_type_id: USD_CREDIT_TYPE_ID,
  //   credit_type_conversions: [
  //     { custom_credit_type_id: AWU_CREDIT_TYPE_ID, fiat_per_custom_credit: 0.01 },
  //   ],
  //   rates: [
  //     // Pro Seat — $30/mo in USD
  //     {
  //       product_name: "Workspace Seat",
  //       starting_at: "2026-04-01T00:00:00.000Z",
  //       entitled: true,
  //       rate_type: "FLAT",
  //       price: 3000,
  //       billing_frequency: "MONTHLY",
  //     },
  //     // AI Usage — 1 AWU per unit (quantity already converted from cost_micro_usd)
  //     {
  //       product_name: "AI Usage (User)",
  //       starting_at: "2026-04-01T00:00:00.000Z",
  //       entitled: true,
  //       rate_type: "FLAT",
  //       price: 1,
  //       credit_type_id: AWU_CREDIT_TYPE_ID,
  //     },
  //     {
  //       product_name: "AI Usage (Programmatic)",
  //       starting_at: "2026-04-01T00:00:00.000Z",
  //       entitled: true,
  //       rate_type: "FLAT",
  //       price: 1,
  //       credit_type_id: AWU_CREDIT_TYPE_ID,
  //     },
  //     // Tool Usage — AWU per invocation (price = tool weight in AWU)
  //     {
  //       product_name: "Tool Usage (User)",
  //       starting_at: "2026-04-01T00:00:00.000Z",
  //       entitled: true,
  //       rate_type: "FLAT",
  //       price: 1,
  //       credit_type_id: AWU_CREDIT_TYPE_ID,
  //     },
  //     {
  //       product_name: "Tool Usage (Programmatic)",
  //       starting_at: "2026-04-01T00:00:00.000Z",
  //       entitled: true,
  //       rate_type: "FLAT",
  //       price: 1,
  //       credit_type_id: AWU_CREDIT_TYPE_ID,
  //     },
  //   ],
  // },
];

// Seat subscription definition shared by all legacy packages.
const LEGACY_SEAT_SUBSCRIPTION: PackageSubscription = {
  temporary_id: "legacy-seat-sub",
  product_name: "Workspace Seat",
  billing_frequency: "MONTHLY",
  collection_schedule: "ADVANCE",
  quantity_management_mode: "SEAT_BASED",
  seat_config: { seat_group_key: "user_id" },
  proration: {
    is_prorated: true,
    invoice_behavior: "BILL_ON_NEXT_COLLECTION_DATE",
  },
};

// Billing cycle config shared by all packages — anchored to contract start date.
const BILLING_CYCLE_CONFIG = {
  billing_anchor_date: "contract_start_date" as const,
  usage_statement_schedule: {
    frequency: "MONTHLY" as const,
    day: "CONTRACT_START" as const,
  },
};

// Packages have NO billing_provider — billing provider is set at contract creation time.
// Shadow mode: create contract without billing_provider_configuration → invoices stay in Metronome.
// Real billing: create contract with billing_provider_configuration: { billing_provider: "stripe" }.
// Package names are versioned (v1, v2, ...) to track pricing changes.
// Aliases stay stable — code always references the alias, which points to the latest version.
// Old versions are archived automatically when a new version is created with the same alias.
// Package names and contract_name are auto-versioned at sync time (e.g., "Legacy Pro $29 v3").
// The version is derived from existing packages in Metronome: if the current package matches,
// keep its version; if it needs recreation, increment by 1.
const PACKAGES: PackageDef[] = [
  {
    name: "Legacy Pro $29",
    aliases: [{ name: "legacy-pro-monthly" }],
    rate_card_name: "Legacy Pro $29",
    subscriptions: [LEGACY_SEAT_SUBSCRIPTION],
    ...BILLING_CYCLE_CONFIG,
  },
  {
    name: "Legacy Business $45",
    aliases: [{ name: "legacy-business" }],
    rate_card_name: "Legacy Business $45",
    subscriptions: [LEGACY_SEAT_SUBSCRIPTION],
    ...BILLING_CYCLE_CONFIG,
  },
  {
    name: "Legacy Pro $27 Annual",
    aliases: [{ name: "legacy-pro-annual" }],
    rate_card_name: "Legacy Pro $27 Annual",
    subscriptions: [LEGACY_SEAT_SUBSCRIPTION],
    ...BILLING_CYCLE_CONFIG,
  },
];

// ---------------------------------------------------------------------------
// State tracking
// ---------------------------------------------------------------------------

const ids = {
  metrics: {} as Record<string, string>,
  products: {} as Record<string, string>,
  rateCards: {} as Record<string, string>,
  packages: {} as Record<string, string>,
};

const recreated = {
  metrics: new Set<string>(),
  products: new Set<string>(),
  rateCards: new Set<string>(),
};

// Skip manually created test objects — never archive them.
function isTestObject(name: string): boolean {
  return name.toLowerCase().startsWith("test");
}

// ---------------------------------------------------------------------------
// Sync: Metrics
// ---------------------------------------------------------------------------

async function syncMetrics(): Promise<void> {
  console.log("\n=== Syncing Metrics ===");

  const existing: Array<{
    id: string;
    name: string;
    aggregation_key?: string;
    aggregation_type?: string;
    group_keys?: string[][];
  }> = [];
  for await (const m of client.v1.billableMetrics.list()) {
    existing.push(m as (typeof existing)[number]);
  }

  const byName = new Map(existing.map((m) => [m.name, m]));
  const desiredNames = new Set(METRICS.map((m) => m.name));

  for (const m of existing) {
    if (!desiredNames.has(m.name) && !isTestObject(m.name)) {
      console.log(`  ⚠ Archiving stale metric: ${m.name} (${m.id})`);
      await client.v1.billableMetrics.archive({ id: m.id });
    }
  }

  for (const desired of METRICS) {
    const ex = byName.get(desired.name);
    const groupKeysMatch =
      JSON.stringify(ex?.group_keys ?? []) ===
      JSON.stringify(desired.group_keys ?? []);
    const configMatch =
      ex &&
      ex.aggregation_key === desired.aggregation_key &&
      ex.aggregation_type?.toLowerCase() ===
        desired.aggregation_type.toLowerCase() &&
      groupKeysMatch;

    if (ex && configMatch) {
      console.log(`  ✓ ${desired.name} — up to date (${ex.id})`);
      ids.metrics[desired.name] = ex.id;
    } else {
      if (ex) {
        console.log(`  ↻ ${desired.name} — config changed, archiving ${ex.id}`);
        await client.v1.billableMetrics.archive({ id: ex.id });
      }
      console.log(`  + Creating: ${desired.name}`);
      const created = await client.v1.billableMetrics.create(
        desired as Parameters<typeof client.v1.billableMetrics.create>[0]
      );
      const id = (created as { data: { id: string } }).data.id;
      console.log(`    → ${id}`);
      ids.metrics[desired.name] = id;
      recreated.metrics.add(desired.name);
    }
  }
}

// ---------------------------------------------------------------------------
// Sync: Products
// ---------------------------------------------------------------------------

function arraysEqual(a?: string[], b?: string[]): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function productMatches(
  ex: {
    id: string;
    type: string;
    current?: {
      billable_metric_id?: string;
      pricing_group_key?: string[];
      presentation_group_key?: string[];
      tags?: string[];
      quantity_conversion?: {
        conversion_factor: number;
        operation: string;
      } | null;
      quantity_rounding?: {
        decimal_places: number;
        rounding_method: string;
      } | null;
    };
  },
  desired: ProductDef
): boolean {
  const cur = ex.current;
  if (!cur) {
    return false;
  }

  // Check type
  if (ex.type !== desired.type) {
    return false;
  }

  // Check metric ID
  const expectedMetricId = desired.billable_metric_name
    ? ids.metrics[desired.billable_metric_name]
    : undefined;
  if (expectedMetricId && cur.billable_metric_id !== expectedMetricId) {
    return false;
  }
  if (!expectedMetricId && cur.billable_metric_id) {
    return false;
  }

  // Check quantity_conversion
  const desiredQc = desired.quantity_conversion;
  const existingQc = cur.quantity_conversion;
  if (desiredQc && existingQc) {
    if (
      desiredQc.conversion_factor !== existingQc.conversion_factor ||
      desiredQc.operation.toUpperCase() !== existingQc.operation.toUpperCase()
    ) {
      return false;
    }
  } else if (
    desiredQc !== undefined &&
    existingQc !== undefined &&
    desiredQc !== null &&
    existingQc !== null
  ) {
    // One is set, the other isn't
    if (!!desiredQc !== !!existingQc) {
      return false;
    }
  }

  // Check quantity_rounding
  const desiredQr = desired.quantity_rounding;
  const existingQr = cur.quantity_rounding;
  if (desiredQr && existingQr) {
    if (
      desiredQr.decimal_places !== existingQr.decimal_places ||
      desiredQr.rounding_method.toUpperCase() !==
        existingQr.rounding_method.toUpperCase()
    ) {
      return false;
    }
  } else if (!!desiredQr !== !!existingQr) {
    return false;
  }

  // Check group keys
  if (!arraysEqual(cur.pricing_group_key, desired.pricing_group_key)) {
    return false;
  }
  if (
    !arraysEqual(cur.presentation_group_key, desired.presentation_group_key)
  ) {
    return false;
  }

  // Check tags
  if (
    !arraysEqual([...(cur.tags ?? [])].sort(), [...(desired.tags ?? [])].sort())
  ) {
    return false;
  }

  return true;
}

async function syncProducts(): Promise<void> {
  console.log("\n=== Syncing Products ===");

  interface ExistingProduct {
    id: string;
    type: string;
    current?: {
      name: string;
      billable_metric_id?: string;
      pricing_group_key?: string[];
      presentation_group_key?: string[];
      quantity_conversion?: {
        conversion_factor: number;
        operation: string;
      } | null;
      quantity_rounding?: {
        decimal_places: number;
        rounding_method: string;
      } | null;
    };
  }

  const existing: ExistingProduct[] = [];
  for await (const p of client.v1.contracts.products.list()) {
    existing.push(p as ExistingProduct);
  }

  const byName = new Map(existing.map((p) => [p.current?.name ?? "", p]));
  const desiredNames = new Set(PRODUCTS.map((p) => p.name));

  for (const p of existing) {
    const name = p.current?.name ?? "";
    if (!desiredNames.has(name) && !isTestObject(name)) {
      console.log(`  ⚠ Archiving stale product: ${name} (${p.id})`);
      try {
        await client.v1.contracts.products.archive({ product_id: p.id });
      } catch {
        console.log(`    (archive failed — may have active references)`);
      }
    }
  }

  for (const desired of PRODUCTS) {
    const ex = byName.get(desired.name);

    const isUpToDate = ex && productMatches(ex, desired);

    if (isUpToDate) {
      console.log(`  ✓ ${desired.name} — up to date (${ex.id})`);
      ids.products[desired.name] = ex.id;
    } else {
      if (ex) {
        console.log(`  ↻ ${desired.name} — config changed, archiving ${ex.id}`);
        try {
          await client.v1.contracts.products.archive({ product_id: ex.id });
        } catch {
          console.log(`    (archive failed)`);
        }
      }

      const metricId = desired.billable_metric_name
        ? ids.metrics[desired.billable_metric_name]
        : undefined;
      if (desired.billable_metric_name && !metricId) {
        throw new Error(`Metric not found: ${desired.billable_metric_name}`);
      }

      console.log(`  + Creating: ${desired.name}`);
      const created = await client.v1.contracts.products.create({
        name: desired.name,
        type: desired.type,
        billable_metric_id: metricId,
        quantity_conversion: desired.quantity_conversion ?? undefined,
        quantity_rounding: desired.quantity_rounding ?? undefined,
        pricing_group_key: desired.pricing_group_key,
        presentation_group_key: desired.presentation_group_key,
        tags: desired.tags,
      });
      const id = (created as { data: { id: string } }).data.id;
      console.log(`    → ${id}`);
      ids.products[desired.name] = id;
      recreated.products.add(desired.name);
    }
  }
}

// ---------------------------------------------------------------------------
// Sync: Rate Cards
// ---------------------------------------------------------------------------

function rateCardMatches(ex: ExistingRateCard, desired: RateCardDef): boolean {
  if (ex.description !== desired.description) {
    return false;
  }
  if (ex.fiat_credit_type?.id !== desired.fiat_credit_type_id) {
    return false;
  }

  // Compare aliases
  const exAliases = (ex.aliases ?? []).map((a) => a.name).sort();
  const desiredAliases = desired.aliases.map((a) => a.name).sort();
  if (!arraysEqual(exAliases, desiredAliases)) {
    return false;
  }

  // Compare credit type conversions
  const exConvs = (ex.credit_type_conversions ?? [])
    .map((c) => `${c.custom_credit_type?.id}:${c.fiat_per_custom_credit}`)
    .sort();
  const desiredConvs = (desired.credit_type_conversions ?? [])
    .map((c) => `${c.custom_credit_type_id}:${c.fiat_per_custom_credit}`)
    .sort();
  if (!arraysEqual(exConvs, desiredConvs)) {
    return false;
  }

  // Check if any referenced product was recreated
  if (desired.rates.some((r) => recreated.products.has(r.product_name))) {
    return false;
  }

  return true;
}

interface ExistingRateCard {
  id: string;
  name: string;
  description?: string;
  fiat_credit_type?: { id: string; name: string };
  aliases?: Array<{ name: string }>;
  credit_type_conversions?: Array<{
    custom_credit_type?: { id: string; name: string };
    fiat_per_custom_credit: string;
  }>;
}

async function syncRateCards(): Promise<void> {
  console.log("\n=== Syncing Rate Cards ===");

  const existing: ExistingRateCard[] = [];
  for await (const r of client.v1.contracts.rateCards.list({ body: {} })) {
    existing.push(r as ExistingRateCard);
  }

  const byName = new Map(existing.map((r) => [r.name, r]));
  const desiredNames = new Set(RATE_CARDS.map((r) => r.name));

  for (const r of existing) {
    if (!desiredNames.has(r.name) && !isTestObject(r.name)) {
      console.log(`  ⚠ Archiving stale rate card: ${r.name} (${r.id})`);
      try {
        await client.v1.contracts.rateCards.archive({ id: r.id });
      } catch {
        console.log(`    (archive failed)`);
      }
    }
  }

  for (const desired of RATE_CARDS) {
    const ex = byName.get(desired.name);

    if (ex && rateCardMatches(ex, desired)) {
      console.log(`  ✓ ${desired.name} — up to date (${ex.id})`);
      ids.rateCards[desired.name] = ex.id;
    } else {
      if (ex) {
        console.log(`  ↻ ${desired.name} — config changed, archiving ${ex.id}`);
        try {
          await client.v1.contracts.rateCards.archive({ id: ex.id });
        } catch {
          console.log(`    (archive failed)`);
        }
      }

      console.log(`  + Creating: ${desired.name}`);
      const created = await client.v1.contracts.rateCards.create({
        name: desired.name,
        description: desired.description,
        aliases: desired.aliases,
        fiat_credit_type_id: desired.fiat_credit_type_id,
        credit_type_conversions: desired.credit_type_conversions,
      });
      const id = (created as { data: { id: string } }).data.id;
      console.log(`    → ${id}`);
      ids.rateCards[desired.name] = id;

      // Add rates (one at a time — SDK takes a single rate per call)
      console.log(`    Adding ${desired.rates.length} rates...`);
      for (const r of desired.rates) {
        const productId = ids.products[r.product_name];
        if (!productId) {
          throw new Error(`Product not found: ${r.product_name}`);
        }
        await client.v1.contracts.rateCards.rates.add({
          rate_card_id: id,
          product_id: productId,
          starting_at: r.starting_at,
          entitled: r.entitled,
          rate_type: r.rate_type as "FLAT",
          price: r.price,
          credit_type_id: r.credit_type_id,
          pricing_group_values: r.pricing_group_values,
          billing_frequency: r.billing_frequency as
            | "MONTHLY"
            | "QUARTERLY"
            | "ANNUAL"
            | "WEEKLY"
            | undefined,
        });
      }

      recreated.rateCards.add(desired.name);
    }
  }
}

// ---------------------------------------------------------------------------
// Sync: Packages
// ---------------------------------------------------------------------------

interface ExistingPackage {
  id: string;
  name: string;
  contract_name?: string;
  aliases?: Array<{ name: string }>;
  rate_card_id?: string;
  subscriptions?: Array<{
    collection_schedule: string;
    proration: {
      invoice_behavior: string;
      is_prorated: boolean;
    };
    subscription_rate: {
      billing_frequency: string;
      product?: { id: string };
      product_id?: string;
    };
    quantity_management_mode?: string;
    seat_config?: { seat_group_key: string };
  }>;
}

function packageMatches(ex: ExistingPackage, desired: PackageDef): boolean {
  // Check rate card cascade
  if (recreated.rateCards.has(desired.rate_card_name)) {
    return false;
  }

  // Check subscriptions count
  const desiredSubs = desired.subscriptions ?? [];
  const existingSubs = ex.subscriptions ?? [];
  if (desiredSubs.length !== existingSubs.length) {
    return false;
  }

  // Check each subscription's config
  for (const desiredSub of desiredSubs) {
    const productId = ids.products[desiredSub.product_name];
    const matchingSub = existingSubs.find(
      (s) =>
        (s.subscription_rate.product?.id ?? s.subscription_rate.product_id) ===
        productId
    );
    if (!matchingSub) {
      return false;
    }
    if (matchingSub.collection_schedule !== desiredSub.collection_schedule) {
      return false;
    }
    if (
      matchingSub.subscription_rate.billing_frequency !==
      desiredSub.billing_frequency
    ) {
      return false;
    }
    if (desiredSub.proration) {
      if (
        matchingSub.proration.is_prorated !== desiredSub.proration.is_prorated
      ) {
        return false;
      }
      if (
        desiredSub.proration.invoice_behavior &&
        matchingSub.proration.invoice_behavior !==
          desiredSub.proration.invoice_behavior
      ) {
        return false;
      }
    }
    if (
      desiredSub.quantity_management_mode &&
      matchingSub.quantity_management_mode !==
        desiredSub.quantity_management_mode
    ) {
      return false;
    }
  }

  return true;
}

async function syncPackages(): Promise<void> {
  console.log("\n=== Syncing Packages ===");

  const existing: ExistingPackage[] = [];
  for await (const p of client.v1.packages.list()) {
    existing.push(p as ExistingPackage);
  }

  // Build a map from alias → existing package (a package may have multiple aliases).
  const byAlias = new Map<string, ExistingPackage>();
  for (const p of existing) {
    for (const alias of p.aliases ?? []) {
      byAlias.set(alias.name, p);
    }
  }

  // Collect all desired aliases to identify stale packages.
  const desiredAliases = new Set(
    PACKAGES.flatMap((p) => p.aliases.map((a) => a.name))
  );

  // Archive packages whose aliases are not in the desired set (and not test objects).
  for (const p of existing) {
    const aliases = (p.aliases ?? []).map((a) => a.name);
    const isDesired = aliases.some((a) => desiredAliases.has(a));
    if (!isDesired && !isTestObject(p.name)) {
      console.log(`  ⚠ Archiving stale package: ${p.name} (${p.id})`);
      try {
        await client.v1.packages.archive({ package_id: p.id });
      } catch {
        console.log(`    (archive failed — may have active contracts)`);
      }
    }
  }

  for (const desired of PACKAGES) {
    // Find existing package by alias (not name — name changes on version bumps).
    const primaryAlias = desired.aliases[0]?.name;
    const ex = primaryAlias ? byAlias.get(primaryAlias) : undefined;

    // Extract current version from existing package name (e.g., "Legacy Pro $29 v3" → 3).
    const existingVersion = ex?.name
      ? parseInt(ex.name.match(/\sv(\d+)$/)?.[1] ?? "0", 10)
      : 0;

    if (ex && packageMatches(ex, desired)) {
      // Up to date — keep existing version.
      const versionedName = `${desired.name} v${existingVersion || 1}`;
      console.log(`  ✓ ${versionedName} — up to date (${ex.id})`);
      ids.packages[desired.name] = ex.id;
    } else {
      // Needs recreation — increment version.
      const newVersion = existingVersion + 1;
      const versionedName = `${desired.name} v${newVersion}`;

      if (ex) {
        console.log(
          `  ↻ ${versionedName} — config changed, archiving ${ex.name} (${ex.id})`
        );
        try {
          await client.v1.packages.archive({ package_id: ex.id });
        } catch {
          console.log(`    (archive failed)`);
        }
      }

      const rateCardId = ids.rateCards[desired.rate_card_name];
      if (!rateCardId) {
        throw new Error(`Rate card not found: ${desired.rate_card_name}`);
      }

      console.log(`  + Creating: ${versionedName}`);
      // Resolve subscription product IDs
      const subscriptions = (desired.subscriptions ?? []).map((sub) => {
        const productId = ids.products[sub.product_name];
        if (!productId) {
          throw new Error(
            `Product not found for subscription: ${sub.product_name}`
          );
        }
        return {
          temporary_id: sub.temporary_id,
          subscription_rate: {
            billing_frequency: sub.billing_frequency,
            product_id: productId,
          },
          collection_schedule: sub.collection_schedule,
          quantity_management_mode: sub.quantity_management_mode,
          ...(sub.seat_config ? { seat_config: sub.seat_config } : {}),
          ...(sub.proration ? { proration: sub.proration } : {}),
        };
      });

      const created = await client.v1.packages.create({
        name: versionedName,
        contract_name: versionedName,
        aliases: desired.aliases,
        rate_card_id: rateCardId,
        billing_anchor_date: desired.billing_anchor_date,
        ...(desired.usage_statement_schedule
          ? { usage_statement_schedule: desired.usage_statement_schedule }
          : {}),
        ...(subscriptions.length > 0 ? { subscriptions } : {}),
      } as Parameters<typeof client.v1.packages.create>[0]);
      const id = (created as { data: { id: string } }).data.id;
      console.log(`    → ${id}`);
      ids.packages[desired.name] = id;
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("Metronome Setup — syncing desired state to sandbox\n");

  console.log(`Environment: ${ENV}`);
  console.log(
    `Credit types: USD=${USD_CREDIT_TYPE_ID}, AWU=${AWU_CREDIT_TYPE_ID}`
  );

  await syncMetrics();
  await syncProducts();
  await syncRateCards();
  await syncPackages();

  console.log("\n=== ID Summary ===");
  for (const [category, map] of Object.entries(ids)) {
    console.log(`\n${category}:`);
    for (const [name, id] of Object.entries(map)) {
      console.log(`  ${name}: ${id}`);
    }
  }

  // Output constants for lib/metronome/constants.ts
  const prefix = ENV === "production" ? "PROD" : "DEV";
  console.log(
    `\n=== Constants (${ENV}) — paste into lib/metronome/constants.ts ===`
  );
  console.log(
    `const ${prefix}_FREE_CREDIT_PRODUCT_ID = "${ids.products["Free Monthly Credits"] ?? ""}";`
  );
  console.log(
    `const ${prefix}_COMMIT_PRODUCT_ID = "${ids.products["Prepaid Commit"] ?? ""}";`
  );
  console.log(
    `const ${prefix}_LLM_PROGRAMMATIC_BILLABLE_METRIC_ID =\n  "${ids.metrics["LLM Provider Cost (Programmatic)"] ?? ""}";`
  );
  console.log(
    `const ${prefix}_TOOL_PROGRAMMATIC_BILLABLE_METRIC_ID =\n  "${ids.metrics["Tool Invocations (Programmatic)"] ?? ""}";`
  );

  console.log("\n✓ Done");
}

void main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
