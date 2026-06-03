/**
 * Metronome Setup — idempotent TypeScript script using the official SDK.
 *
 * Fetches existing metrics/products/rate cards/packages from Metronome,
 * compares by name, archives stale ones, creates missing ones.
 * Cascading: if a metric is recreated, dependent products are also recreated,
 * which cascades to rate cards, then packages.
 *
 * Run with: npx tsx scripts/metronome_setup.ts [--execute]
 *
 * Without --execute, runs in dry-run mode (logs what would change, no mutations).
 * Requires: METRONOME_API_KEY env var
 */

import { getMetronomeClient } from "@app/lib/metronome/client";
import {
  CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY,
  CREDIT_TYPE_USD_ID,
  DEV_CREDIT_TYPE_AWU_ID,
  PLAN_CODE_CUSTOM_FIELD_KEY,
  PROD_CREDIT_TYPE_AWU_ID,
  SEAT_TYPE_CUSTOM_FIELD_KEY,
  STRIPE_PRODUCT_ID_CUSTOM_FIELD_KEY,
} from "@app/lib/metronome/constants";
import { invalidateProductSeatTypesCache } from "@app/lib/metronome/seat_types";
import {
  getCreditTypeAwuId,
  getCreditTypeProgrammaticUsdId,
  type PackageDef,
  PRODUCTS,
  type ProductDef,
  type RateCardDef,
  setMetronomeEnv,
} from "@app/lib/metronome/setup_common";
import {
  getLegacyPackages,
  getLegacyRateCards,
  LEGACY_METRICS,
} from "@app/lib/metronome/setup_legacy";
import {
  getNewPackages,
  getNewRateCards,
  NEW_METRICS,
} from "@app/lib/metronome/setup_new_pricing";

if (!process.env.METRONOME_API_KEY) {
  console.error("METRONOME_API_KEY env var required");
  process.exit(1);
}

const EXECUTE = process.argv.includes("--execute");

const client = getMetronomeClient();

// Detect environment by listing pricing units and checking for the AWU credit type.
// AWU and Programmatic USD have different IDs in sandbox vs production; USD/EUR are the same.

async function detectEnvironment(): Promise<"sandbox" | "production"> {
  const creditTypeIds = new Set<string>();
  for await (const pu of client.v1.pricingUnits.list()) {
    if (pu.id) {
      creditTypeIds.add(pu.id);
    }
  }
  if (creditTypeIds.has(PROD_CREDIT_TYPE_AWU_ID)) {
    return "production";
  }
  if (creditTypeIds.has(DEV_CREDIT_TYPE_AWU_ID)) {
    return "sandbox";
  }
  throw new Error(
    "Cannot detect Metronome environment: AWU credit type not found. " +
      `Expected sandbox=${DEV_CREDIT_TYPE_AWU_ID} or production=${PROD_CREDIT_TYPE_AWU_ID}`
  );
}

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
    event_type_filter?: { in_values: string[] };
    property_filters?: Array<{
      name: string;
      exists?: boolean;
      in_values?: string[];
    }>;
  }> = [];
  for await (const m of client.v1.billableMetrics.list()) {
    existing.push(m as (typeof existing)[number]);
  }

  const metrics = [...LEGACY_METRICS, ...NEW_METRICS];

  const byName = new Map(existing.map((m) => [m.name, m]));
  const desiredNames = new Set(metrics.map((m) => m.name));

  for (const m of existing) {
    if (!desiredNames.has(m.name) && !isTestObject(m.name)) {
      console.log(
        `  ! ${EXECUTE ? "Archiving" : "[DRYRUN] Would archive"} stale metric: ${m.name} (${m.id})`
      );
      if (EXECUTE) {
        await client.v1.billableMetrics.archive({ id: m.id });
      }
    }
  }

  for (const desired of metrics) {
    const ex = byName.get(desired.name);
    const sortGroupKeys = (keys: string[][]) =>
      [...keys].sort((a, b) => a.join(",").localeCompare(b.join(",")));
    const groupKeysMatch =
      JSON.stringify(sortGroupKeys(ex?.group_keys ?? [])) ===
      JSON.stringify(sortGroupKeys(desired.group_keys ?? []));
    const eventTypeMatch =
      JSON.stringify(ex?.event_type_filter?.in_values?.sort() ?? []) ===
      JSON.stringify([...desired.event_type_filter.in_values].sort());
    const sortFilters = (
      filters: Array<{
        name: string;
        exists?: boolean;
        in_values?: string[];
      }>
    ) => [...filters].sort((a, b) => a.name.localeCompare(b.name));
    const propertyFiltersMatch =
      JSON.stringify(sortFilters(ex?.property_filters ?? [])) ===
      JSON.stringify(sortFilters(desired.property_filters ?? []));
    const configMatch =
      ex &&
      ex.aggregation_key === desired.aggregation_key &&
      ex.aggregation_type?.toLowerCase() ===
        desired.aggregation_type.toLowerCase() &&
      groupKeysMatch &&
      eventTypeMatch &&
      propertyFiltersMatch;

    if (ex && configMatch) {
      console.log(`  ✓ ${desired.name} — up to date (${ex.id})`);
      ids.metrics[desired.name] = ex.id;
    } else {
      if (ex) {
        if (ex.aggregation_key !== desired.aggregation_key) {
          console.log(
            `    [diff] ${desired.name}: aggregation_key ${ex.aggregation_key} → ${desired.aggregation_key}`
          );
        }
        if (
          ex.aggregation_type?.toLowerCase() !==
          desired.aggregation_type.toLowerCase()
        ) {
          console.log(
            `    [diff] ${desired.name}: aggregation_type ${ex.aggregation_type} → ${desired.aggregation_type}`
          );
        }
        if (!groupKeysMatch) {
          console.log(
            `    [diff] ${desired.name}: group_keys ${JSON.stringify(sortGroupKeys(ex.group_keys ?? []))} → ${JSON.stringify(sortGroupKeys(desired.group_keys ?? []))}`
          );
        }
        if (!eventTypeMatch) {
          console.log(
            `    [diff] ${desired.name}: event_type_filter ${JSON.stringify(ex.event_type_filter?.in_values?.sort() ?? [])} → ${JSON.stringify([...desired.event_type_filter.in_values].sort())}`
          );
        }
        if (!propertyFiltersMatch) {
          console.log(
            `    [diff] ${desired.name}: property_filters ${JSON.stringify(sortFilters(ex.property_filters ?? []))} → ${JSON.stringify(sortFilters(desired.property_filters ?? []))}`
          );
        }
        console.log(
          `  ↻ ${desired.name} — config changed${EXECUTE ? ", archiving" : ""} ${ex.id}`
        );
        if (EXECUTE) {
          await client.v1.billableMetrics.archive({ id: ex.id });
        }
      }
      if (EXECUTE) {
        console.log(`  + Creating: ${desired.name}`);
        const created = await client.v1.billableMetrics.create(
          desired as Parameters<typeof client.v1.billableMetrics.create>[0]
        );
        const id = (created as { data: { id: string } }).data.id;
        console.log(`    → ${id}`);
        ids.metrics[desired.name] = id;
      } else {
        console.log(`  + [DRYRUN] Would create: ${desired.name}`);
        // Use existing ID if available (for cascading checks), otherwise placeholder.
        ids.metrics[desired.name] = ex?.id ?? `dryrun-${desired.name}`;
      }
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
    console.log(`    [diff] ${desired.name}: no current revision`);
    return false;
  }

  if (ex.type !== desired.type) {
    console.log(
      `    [diff] ${desired.name}: type ${ex.type} → ${desired.type}`
    );
    return false;
  }

  const expectedMetricId = desired.billable_metric_name
    ? ids.metrics[desired.billable_metric_name]
    : undefined;
  if (expectedMetricId && cur.billable_metric_id !== expectedMetricId) {
    console.log(
      `    [diff] ${desired.name}: billable_metric_id ${cur.billable_metric_id} → ${expectedMetricId}`
    );
    return false;
  }
  if (!expectedMetricId && cur.billable_metric_id) {
    console.log(
      `    [diff] ${desired.name}: billable_metric_id ${cur.billable_metric_id} should be unset`
    );
    return false;
  }

  const desiredQc = desired.quantity_conversion;
  const existingQc = cur.quantity_conversion;
  if (desiredQc && existingQc) {
    if (
      desiredQc.conversion_factor !== existingQc.conversion_factor ||
      desiredQc.operation.toUpperCase() !== existingQc.operation.toUpperCase()
    ) {
      console.log(
        `    [diff] ${desired.name}: quantity_conversion ${JSON.stringify(existingQc)} → ${JSON.stringify(desiredQc)}`
      );
      return false;
    }
  } else if (!!desiredQc !== !!existingQc) {
    console.log(
      `    [diff] ${desired.name}: quantity_conversion presence ${!!existingQc} → ${!!desiredQc}`
    );
    return false;
  }

  const desiredQr = desired.quantity_rounding;
  const existingQr = cur.quantity_rounding;
  if (desiredQr && existingQr) {
    if (
      desiredQr.decimal_places !== existingQr.decimal_places ||
      desiredQr.rounding_method.toUpperCase() !==
        existingQr.rounding_method.toUpperCase()
    ) {
      console.log(
        `    [diff] ${desired.name}: quantity_rounding ${JSON.stringify(existingQr)} → ${JSON.stringify(desiredQr)}`
      );
      return false;
    }
  } else if (!!desiredQr !== !!existingQr) {
    console.log(
      `    [diff] ${desired.name}: quantity_rounding presence ${!!existingQr} → ${!!desiredQr}`
    );
    return false;
  }

  if (!arraysEqual(cur.pricing_group_key, desired.pricing_group_key)) {
    console.log(
      `    [diff] ${desired.name}: pricing_group_key [${cur.pricing_group_key ?? ""}] → [${desired.pricing_group_key ?? ""}]`
    );
    return false;
  }
  if (
    !arraysEqual(cur.presentation_group_key, desired.presentation_group_key)
  ) {
    console.log(
      `    [diff] ${desired.name}: presentation_group_key [${cur.presentation_group_key ?? ""}] → [${desired.presentation_group_key ?? ""}]`
    );
    return false;
  }

  // NOTE: `tags` are intentionally NOT compared here — a tag-only change is
  // reconciled in place via `reconcileProductTags` (no archive/recreate).

  return true;
}

// Returns true when any product was created, archived, or had its
// `custom_fields` updated — i.e. the cached `productId → seatType` map in
// Redis is now stale and needs invalidating. Returns false on a no-op run so
// `main()` can skip the Redis call entirely.
async function syncProducts(): Promise<boolean> {
  console.log("\n=== Syncing Products ===");

  let mutated = false;

  interface ExistingProduct {
    id: string;
    type: string;
    current?: {
      name: string;
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
    custom_fields?: Record<string, string>;
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
      console.log(
        `  ! ${EXECUTE ? "Archiving" : "[DRYRUN] Would archive"} stale product: ${name} (${p.id})`
      );
      if (EXECUTE) {
        try {
          await client.v1.contracts.products.archive({ product_id: p.id });
          mutated = true;
        } catch {
          console.log(`    (archive failed — may have active references)`);
        }
      }
    }
  }

  for (const desired of PRODUCTS) {
    const ex = byName.get(desired.name);

    const isUpToDate = ex && productMatches(ex, desired);

    if (isUpToDate) {
      console.log(`  ✓ ${desired.name} — up to date (${ex.id})`);
      ids.products[desired.name] = ex.id;
      if (await reconcileProductCustomFields(ex, desired)) {
        mutated = true;
      }
      // Tags are edited in place (no recreate); tag drift doesn't affect the
      // product seat-type cache, so it doesn't flip `mutated`.
      await reconcileProductTags(ex, desired);
    } else {
      if (ex) {
        console.log(
          `  ↻ ${desired.name} — config changed${EXECUTE ? ", archiving" : ""} ${ex.id}`
        );
        if (EXECUTE) {
          try {
            await client.v1.contracts.products.archive({ product_id: ex.id });
            mutated = true;
          } catch {
            console.log(`    (archive failed)`);
          }
        }
      }

      if (EXECUTE) {
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
          custom_fields: desired.custom_fields,
        });
        const id = (created as { data: { id: string } }).data.id;
        console.log(`    → ${id}`);
        ids.products[desired.name] = id;
        mutated = true;
      } else {
        console.log(`  + [DRYRUN] Would create: ${desired.name}`);
        ids.products[desired.name] = ex?.id ?? `dryrun-${desired.name}`;
      }
      recreated.products.add(desired.name);
    }
  }

  return mutated;
}

/**
 * Reconcile `custom_fields` on an existing product via `setValues` — drift on
 * custom fields alone never triggers a product recreate (and the matching
 * predicate above intentionally ignores them).
 *
 * Returns true when an update was actually applied (EXECUTE + drift detected)
 * so the caller can flag the product-seat-type cache as stale.
 */
async function reconcileProductCustomFields(
  ex: { id: string; custom_fields?: Record<string, string> },
  desired: ProductDef
): Promise<boolean> {
  const desiredCfs = desired.custom_fields;
  if (!desiredCfs || Object.keys(desiredCfs).length === 0) {
    return false;
  }
  const existingCfs = ex.custom_fields ?? {};
  const drift: Record<string, string> = {};
  for (const [key, value] of Object.entries(desiredCfs)) {
    if (existingCfs[key] !== value) {
      drift[key] = value;
    }
  }
  if (Object.keys(drift).length === 0) {
    return false;
  }
  console.log(
    `  ✎ ${EXECUTE ? "Updating" : "[DRYRUN] Would update"} ${desired.name} custom_fields ${JSON.stringify(drift)}`
  );
  if (EXECUTE) {
    await client.v1.customFields.setValues({
      entity: "contract_product",
      entity_id: ex.id,
      custom_fields: drift,
    });
    return true;
  }
  return false;
}

// Pricing-era start — matches the `starting_at` used for all rates, and is on
// an hour boundary as required by the product update API.
const PRODUCT_UPDATE_STARTING_AT = "2026-04-01T00:00:00.000Z";

/**
 * Reconcile `tags` on an existing product via `products.update` — tags are
 * edited in place, so tag drift never triggers a product archive/recreate (and
 * `productMatches` intentionally ignores them).
 *
 * Returns true when an update was actually applied (EXECUTE + drift detected).
 */
async function reconcileProductTags(
  ex: { id: string; current?: { tags?: string[] } },
  desired: ProductDef
): Promise<boolean> {
  const desiredTags = [...(desired.tags ?? [])].sort();
  const existingTags = [...(ex.current?.tags ?? [])].sort();
  if (arraysEqual(desiredTags, existingTags)) {
    return false;
  }
  console.log(
    `  ✎ ${EXECUTE ? "Updating" : "[DRYRUN] Would update"} ${desired.name} tags [${ex.current?.tags ?? ""}] → [${desired.tags ?? ""}]`
  );
  if (EXECUTE) {
    await client.v1.contracts.products.update({
      product_id: ex.id,
      starting_at: PRODUCT_UPDATE_STARTING_AT,
      tags: desired.tags ?? [],
    });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Sync: Rate Cards
// ---------------------------------------------------------------------------

async function rateCardMatches(
  ex: ExistingRateCard,
  desired: RateCardDef
): Promise<boolean> {
  if (ex.description !== desired.description) {
    console.log(`    [diff] ${ex.name}: description changed`);
    return false;
  }
  if (ex.fiat_credit_type?.id !== desired.fiat_credit_type_id) {
    console.log(
      `    [diff] ${ex.name}: fiat_credit_type ${ex.fiat_credit_type?.id} → ${desired.fiat_credit_type_id}`
    );
    return false;
  }

  // Compare aliases
  const exAliases = (ex.aliases ?? []).map((a) => a.name).sort();
  const desiredAliases = desired.aliases.map((a) => a.name).sort();
  if (!arraysEqual(exAliases, desiredAliases)) {
    console.log(
      `    [diff] ${ex.name}: aliases [${exAliases}] → [${desiredAliases}]`
    );
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
    console.log(
      `    [diff] ${ex.name}: credit_type_conversions [${exConvs}] → [${desiredConvs}]`
    );
    return false;
  }

  // Check if any referenced product was recreated
  if (desired.rates.some((r) => recreated.products.has(r.product_name))) {
    const recreatedProducts = desired.rates
      .filter((r) => recreated.products.has(r.product_name))
      .map((r) => r.product_name);
    console.log(
      `    [diff] ${ex.name}: products recreated: ${recreatedProducts.join(", ")}`
    );
    return false;
  }

  // Compare actual rates on the rate card.
  const existingRates: Array<{
    product_id?: string;
    entitled?: boolean;
    billing_frequency?: string;
    pricing_group_values?: Record<string, string>;
    rate?: {
      price?: number;
      credit_type?: { id: string };
    };
  }> = [];
  for await (const rate of client.v1.contracts.rateCards.rates.list({
    rate_card_id: ex.id,
    at: new Date().toISOString(),
  })) {
    existingRates.push(rate as (typeof existingRates)[number]);
  }

  if (existingRates.length !== desired.rates.length) {
    console.log(
      `    [diff] ${ex.name}: rate count ${existingRates.length} → ${desired.rates.length}`
    );
    return false;
  }

  // Stable serialization of pricing_group_values so two rates on the same
  // product but different group values can be told apart.
  const serializeGroupValues = (v?: Record<string, string>): string =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(v ?? {}).sort(([a], [b]) => a.localeCompare(b))
      )
    );

  for (const desiredRate of desired.rates) {
    const productId = ids.products[desiredRate.product_name];
    const desiredGroupKey = serializeGroupValues(
      desiredRate.pricing_group_values
    );
    const match = existingRates.find(
      (r) =>
        r.product_id === productId &&
        serializeGroupValues(r.pricing_group_values) === desiredGroupKey
    );
    if (!match) {
      console.log(
        `    [diff] ${ex.name}: product ${desiredRate.product_name} (${productId}) with group_values ${desiredGroupKey} not found in existing rates`
      );
      return false;
    }
    if (match.rate?.price !== desiredRate.price) {
      console.log(
        `    [diff] ${ex.name}: ${desiredRate.product_name} price ${match.rate?.price} → ${desiredRate.price}`
      );
      return false;
    }
    if (match.entitled !== desiredRate.entitled) {
      console.log(
        `    [diff] ${ex.name}: ${desiredRate.product_name} entitled ${match.entitled} → ${desiredRate.entitled}`
      );
      return false;
    }
    if (
      desiredRate.credit_type_id &&
      match.rate?.credit_type?.id !== desiredRate.credit_type_id
    ) {
      console.log(
        `    [diff] ${ex.name}: ${desiredRate.product_name} credit_type ${match.rate?.credit_type?.id} → ${desiredRate.credit_type_id}`
      );
      return false;
    }
    if (
      desiredRate.billing_frequency &&
      match.billing_frequency !== desiredRate.billing_frequency
    ) {
      console.log(
        `    [diff] ${ex.name}: ${desiredRate.product_name} billing_frequency ${match.billing_frequency} → ${desiredRate.billing_frequency}`
      );
      return false;
    }
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
  custom_fields?: Record<string, string>;
}

async function syncRateCards(): Promise<void> {
  console.log("\n=== Syncing Rate Cards ===");

  const rateCards = [...getLegacyRateCards(), ...getNewRateCards()];

  const existing: ExistingRateCard[] = [];
  for await (const r of client.v1.contracts.rateCards.list({ body: {} })) {
    existing.push(r as ExistingRateCard);
  }

  const byName = new Map(existing.map((r) => [r.name, r]));
  const desiredNames = new Set(rateCards.map((r) => r.name));

  for (const r of existing) {
    if (!desiredNames.has(r.name) && !isTestObject(r.name)) {
      console.log(
        `  ! ${EXECUTE ? "Archiving" : "[DRYRUN] Would archive"} stale rate card: ${r.name} (${r.id})`
      );
      if (EXECUTE) {
        try {
          await client.v1.contracts.rateCards.archive({ id: r.id });
        } catch {
          console.log(`    (archive failed)`);
        }
      }
    }
  }

  for (const desired of rateCards) {
    const ex = byName.get(desired.name);

    if (ex && (await rateCardMatches(ex, desired))) {
      console.log(`  ✓ ${desired.name} — up to date (${ex.id})`);
      ids.rateCards[desired.name] = ex.id;
    } else {
      if (ex) {
        console.log(
          `  ↻ ${desired.name} — config changed${EXECUTE ? ", archiving" : ""} ${ex.id}`
        );
        if (EXECUTE) {
          try {
            await client.v1.contracts.rateCards.archive({ id: ex.id });
          } catch {
            console.log(`    (archive failed)`);
          }
        }
      }

      if (EXECUTE) {
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
      } else {
        console.log(
          `  + [DRYRUN] Would create: ${desired.name} (${desired.rates.length} rates)`
        );
        ids.rateCards[desired.name] = ex?.id ?? `dryrun-${desired.name}`;
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
  scheduled_charges_on_usage_invoices?: "ALL";
  // Returned by packages.list — the billing-cycle anchor lives here (`day`).
  // Note: the package-level `billing_anchor_date` we send on create is NOT
  // echoed back, so we compare `usage_statement_schedule` (the real driver)
  // rather than that field, which would always mismatch and recreate every run.
  usage_statement_schedule?: {
    frequency?: string;
    day?: string;
  };
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
    initial_quantity?: number;
  }>;
  recurring_credits?: Array<{
    product: { id: string };
    access_amount: {
      credit_type_id: string;
      unit_price: number;
      quantity?: number;
    };
    commit_duration: { value: number };
    priority: number;
    starting_at_offset: { unit: string; value: number };
    applicable_product_tags?: string[];
    recurrence_frequency?: string;
    name?: string;
    // Metronome returns the resolved subscription identifier (post-create) plus
    // the allocation mode for credits attached to a SEAT_BASED subscription.
    subscription_config?: {
      allocation?: "INDIVIDUAL" | "POOLED";
    };
  }>;
  overrides?: Array<{
    entitled?: boolean;
    type?: string;
    override_specifiers?: Array<{
      product_id?: string;
      billing_frequency?: string;
    }>;
    overwrite_rate?: {
      rate_type?: string;
      price?: number;
      credit_type?: { id: string };
    };
    product?: { id: string };
  }>;
}

function packageMatches(ex: ExistingPackage, desired: PackageDef): boolean {
  if (recreated.rateCards.has(desired.rate_card_name)) {
    console.log(
      `    [diff] ${desired.name}: rate card "${desired.rate_card_name}" recreated this run`
    );
    return false;
  }

  const expectedRateCardId = ids.rateCards[desired.rate_card_name];
  if (expectedRateCardId && ex.rate_card_id !== expectedRateCardId) {
    console.log(
      `    [diff] ${desired.name}: rate_card_id ${ex.rate_card_id} → ${expectedRateCardId}`
    );
    return false;
  }

  const desiredSubs = desired.subscriptions ?? [];
  const existingSubs = ex.subscriptions ?? [];
  if (desiredSubs.length !== existingSubs.length) {
    console.log(
      `    [diff] ${desired.name}: subscription count ${existingSubs.length} → ${desiredSubs.length}`
    );
    return false;
  }

  for (const desiredSub of desiredSubs) {
    const productId = ids.products[desiredSub.product_name];
    const matchingSub = existingSubs.find(
      (s) =>
        (s.subscription_rate.product?.id ?? s.subscription_rate.product_id) ===
        productId
    );
    if (!matchingSub) {
      console.log(
        `    [diff] ${desired.name}: subscription product ${desiredSub.product_name} (${productId}) not found`
      );
      return false;
    }
    if (matchingSub.collection_schedule !== desiredSub.collection_schedule) {
      console.log(
        `    [diff] ${desired.name}: ${desiredSub.product_name} collection_schedule ${matchingSub.collection_schedule} → ${desiredSub.collection_schedule}`
      );
      return false;
    }
    if (
      matchingSub.subscription_rate.billing_frequency !==
      desiredSub.billing_frequency
    ) {
      console.log(
        `    [diff] ${desired.name}: ${desiredSub.product_name} billing_frequency ${matchingSub.subscription_rate.billing_frequency} → ${desiredSub.billing_frequency}`
      );
      return false;
    }
    if (desiredSub.proration) {
      if (
        matchingSub.proration.is_prorated !== desiredSub.proration.is_prorated
      ) {
        console.log(
          `    [diff] ${desired.name}: ${desiredSub.product_name} proration.is_prorated ${matchingSub.proration.is_prorated} → ${desiredSub.proration.is_prorated}`
        );
        return false;
      }
      if (
        desiredSub.proration.invoice_behavior &&
        matchingSub.proration.invoice_behavior !==
          desiredSub.proration.invoice_behavior
      ) {
        console.log(
          `    [diff] ${desired.name}: ${desiredSub.product_name} proration.invoice_behavior ${matchingSub.proration.invoice_behavior} → ${desiredSub.proration.invoice_behavior}`
        );
        return false;
      }
    }
    if (
      desiredSub.quantity_management_mode &&
      matchingSub.quantity_management_mode !==
        desiredSub.quantity_management_mode
    ) {
      console.log(
        `    [diff] ${desired.name}: ${desiredSub.product_name} quantity_management_mode ${matchingSub.quantity_management_mode} → ${desiredSub.quantity_management_mode}`
      );
      return false;
    }
    if (
      (desiredSub.initial_quantity ?? undefined) !==
      (matchingSub.initial_quantity ?? undefined)
    ) {
      console.log(
        `    [diff] ${desired.name}: ${desiredSub.product_name} initial_quantity ${matchingSub.initial_quantity} → ${desiredSub.initial_quantity}`
      );
      return false;
    }
    if (
      (desiredSub.seat_config?.seat_group_key ?? undefined) !==
      (matchingSub.seat_config?.seat_group_key ?? undefined)
    ) {
      console.log(
        `    [diff] ${desired.name}: ${desiredSub.product_name} seat_config.seat_group_key ${matchingSub.seat_config?.seat_group_key} → ${desiredSub.seat_config?.seat_group_key}`
      );
      return false;
    }
  }

  if (
    (desired.scheduled_charges_on_usage_invoices ?? undefined) !==
    (ex.scheduled_charges_on_usage_invoices ?? undefined)
  ) {
    console.log(
      `    [diff] ${desired.name}: scheduled_charges_on_usage_invoices ${ex.scheduled_charges_on_usage_invoices} → ${desired.scheduled_charges_on_usage_invoices}`
    );
    return false;
  }

  // Billing cycle: compare the usage statement schedule (frequency + day). The
  // `day` is what actually anchors billing periods (CONTRACT_START vs
  // FIRST_OF_MONTH), so a change here must force a package recreation.
  if (desired.usage_statement_schedule) {
    if (
      ex.usage_statement_schedule?.frequency !==
      desired.usage_statement_schedule.frequency
    ) {
      console.log(
        `    [diff] ${desired.name}: usage_statement_schedule.frequency ${ex.usage_statement_schedule?.frequency} → ${desired.usage_statement_schedule.frequency}`
      );
      return false;
    }
    if (
      (ex.usage_statement_schedule?.day ?? undefined) !==
      (desired.usage_statement_schedule.day ?? undefined)
    ) {
      console.log(
        `    [diff] ${desired.name}: usage_statement_schedule.day ${ex.usage_statement_schedule?.day} → ${desired.usage_statement_schedule.day}`
      );
      return false;
    }
  }

  const desiredCredits = desired.recurring_credits ?? [];
  const existingCredits = ex.recurring_credits ?? [];
  if (desiredCredits.length !== existingCredits.length) {
    console.log(
      `    [diff] ${desired.name}: recurring_credits count ${existingCredits.length} → ${desiredCredits.length}`
    );
    return false;
  }
  for (const desiredCredit of desiredCredits) {
    const productId = ids.products[desiredCredit.product_name];
    // Match by `name` — multiple recurring credits can share the same product
    // (e.g. Free Monthly + Free Excess both reference the "Free Credits" product),
    // so product_id alone is not a unique key.
    const match = existingCredits.find((c) => c.name === desiredCredit.name);
    if (!match) {
      console.log(
        `    [diff] ${desired.name}: recurring credit "${desiredCredit.name}" not found`
      );
      return false;
    }
    if (match.product.id !== productId) {
      console.log(
        `    [diff] ${desired.name}: recurring credit "${desiredCredit.name}" product_id ${match.product.id} → ${productId}`
      );
      return false;
    }
    if (
      match.access_amount.credit_type_id !==
      desiredCredit.access_amount.credit_type_id
    ) {
      console.log(
        `    [diff] ${desired.name}: recurring credit "${desiredCredit.name}" credit_type_id ${match.access_amount.credit_type_id} → ${desiredCredit.access_amount.credit_type_id}`
      );
      return false;
    }
    if (
      match.access_amount.unit_price !== desiredCredit.access_amount.unit_price
    ) {
      console.log(
        `    [diff] ${desired.name}: recurring credit "${desiredCredit.name}" unit_price ${match.access_amount.unit_price} → ${desiredCredit.access_amount.unit_price}`
      );
      return false;
    }
    if (
      (match.access_amount.quantity ?? undefined) !==
      (desiredCredit.access_amount.quantity ?? undefined)
    ) {
      console.log(
        `    [diff] ${desired.name}: recurring credit "${desiredCredit.name}" quantity ${match.access_amount.quantity} → ${desiredCredit.access_amount.quantity}`
      );
      return false;
    }
    if (
      Number(match.commit_duration.value) !==
      desiredCredit.commit_duration.value
    ) {
      console.log(
        `    [diff] ${desired.name}: recurring credit "${desiredCredit.name}" commit_duration ${match.commit_duration.value} → ${desiredCredit.commit_duration.value}`
      );
      return false;
    }
    if (
      match.starting_at_offset.unit !== desiredCredit.starting_at_offset.unit ||
      Number(match.starting_at_offset.value) !==
        desiredCredit.starting_at_offset.value
    ) {
      console.log(
        `    [diff] ${desired.name}: recurring credit "${desiredCredit.name}" starting_at_offset ${match.starting_at_offset.unit}:${match.starting_at_offset.value} → ${desiredCredit.starting_at_offset.unit}:${desiredCredit.starting_at_offset.value}`
      );
      return false;
    }
    if (
      !arraysEqual(
        [...(match.applicable_product_tags ?? [])].sort(),
        [...(desiredCredit.applicable_product_tags ?? [])].sort()
      )
    ) {
      console.log(
        `    [diff] ${desired.name}: recurring credit "${desiredCredit.name}" applicable_product_tags [${match.applicable_product_tags ?? ""}] → [${desiredCredit.applicable_product_tags ?? ""}]`
      );
      return false;
    }
    if (match.priority !== desiredCredit.priority) {
      console.log(
        `    [diff] ${desired.name}: recurring credit "${desiredCredit.name}" priority ${match.priority} → ${desiredCredit.priority}`
      );
      return false;
    }
    if (
      (match.recurrence_frequency ?? undefined) !==
      (desiredCredit.recurrence_frequency ?? undefined)
    ) {
      console.log(
        `    [diff] ${desired.name}: recurring credit "${desiredCredit.name}" recurrence_frequency ${match.recurrence_frequency} → ${desiredCredit.recurrence_frequency}`
      );
      return false;
    }
    // Compare subscription_config presence and allocation mode. We can't match
    // the subscription_id directly (the existing credit holds a resolved ID
    // while the desired def references a temporary_id), but the allocation mode
    // changing is enough to force recreation.
    const desiredAllocation = desiredCredit.subscription_config?.allocation;
    const existingAllocation = match.subscription_config?.allocation;
    if (desiredAllocation !== existingAllocation) {
      console.log(
        `    [diff] ${desired.name}: recurring credit "${desiredCredit.name}" subscription allocation ${existingAllocation} → ${desiredAllocation}`
      );
      return false;
    }
  }

  const desiredOverrides = desired.overrides ?? [];
  const existingOverrides = ex.overrides ?? [];
  if (desiredOverrides.length !== existingOverrides.length) {
    console.log(
      `    [diff] ${desired.name}: overrides count ${existingOverrides.length} → ${desiredOverrides.length}`
    );
    return false;
  }
  for (const desiredOverride of desiredOverrides) {
    const productId = ids.products[desiredOverride.product_name];
    const match = existingOverrides.find(
      (o) =>
        (o.product?.id ?? o.override_specifiers?.[0]?.product_id) === productId
    );
    if (!match) {
      console.log(
        `    [diff] ${desired.name}: override for ${desiredOverride.product_name} (${productId}) not found`
      );
      return false;
    }
    if ((match.entitled ?? false) !== desiredOverride.entitled) {
      console.log(
        `    [diff] ${desired.name}: override ${desiredOverride.product_name} entitled ${match.entitled} → ${desiredOverride.entitled}`
      );
      return false;
    }
    // When the override stamps a flat rate, compare price and credit type.
    if (desiredOverride.price !== undefined) {
      if (match.overwrite_rate?.price !== desiredOverride.price) {
        console.log(
          `    [diff] ${desired.name}: override ${desiredOverride.product_name} price ${match.overwrite_rate?.price} → ${desiredOverride.price}`
        );
        return false;
      }
      if (
        desiredOverride.credit_type_id &&
        match.overwrite_rate?.credit_type?.id !== desiredOverride.credit_type_id
      ) {
        console.log(
          `    [diff] ${desired.name}: override ${desiredOverride.product_name} credit_type ${match.overwrite_rate?.credit_type?.id} → ${desiredOverride.credit_type_id}`
        );
        return false;
      }
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

  const packages = [...getLegacyPackages(), ...getNewPackages()];

  // Collect all desired aliases to identify stale packages.
  const desiredAliases = new Set(
    packages.flatMap((p) => p.aliases.map((a) => a.name))
  );

  // Archive packages whose aliases are not in the desired set (and not test objects).
  for (const p of existing) {
    const aliases = (p.aliases ?? []).map((a) => a.name);
    const isDesired = aliases.some((a) => desiredAliases.has(a));
    if (!isDesired && !isTestObject(p.name)) {
      console.log(
        `  ! ${EXECUTE ? "Archiving" : "[DRYRUN] Would archive"} stale package: ${p.name} (${p.id})`
      );
      if (EXECUTE) {
        try {
          await client.v1.packages.archive({ package_id: p.id });
        } catch {
          console.log(`    (archive failed — may have active contracts)`);
        }
      }
    }
  }

  for (const desired of packages) {
    // Find existing package by alias (not name — name changes on version bumps).
    const primaryAlias = desired.aliases[0]?.name;
    const ex = primaryAlias ? byAlias.get(primaryAlias) : undefined;

    // Extract current version from existing package name (e.g., "Legacy Pro USD v3" → 3).
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
          `  ↻ ${versionedName} — config changed${EXECUTE ? ", archiving" : ""} ${ex.name} (${ex.id})`
        );
        if (EXECUTE) {
          try {
            await client.v1.packages.archive({ package_id: ex.id });
          } catch {
            console.log(`    (archive failed)`);
          }
        }
      }

      if (EXECUTE) {
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
            ...(sub.initial_quantity !== undefined
              ? { initial_quantity: sub.initial_quantity }
              : {}),
            ...(sub.proration ? { proration: sub.proration } : {}),
          };
        });

        // Resolve recurring credit product IDs
        const recurringCredits = (desired.recurring_credits ?? []).map(
          (credit) => {
            const productId = ids.products[credit.product_name];
            if (!productId) {
              throw new Error(
                `Product not found for recurring credit: ${credit.product_name}`
              );
            }
            // For credits attached to a SEAT_BASED subscription via
            // subscription_config, Metronome's `subscription_id` field in the
            // package payload accepts the `temporary_id` of the Subscription
            // declared in the same payload.
            const subscriptionConfig = credit.subscription_config
              ? {
                  subscription_id:
                    credit.subscription_config.subscription_temporary_id,
                  allocation: credit.subscription_config.allocation,
                  apply_seat_increase_config:
                    credit.subscription_config.apply_seat_increase_config,
                }
              : undefined;
            return {
              product_id: productId,
              access_amount: credit.access_amount,
              commit_duration: credit.commit_duration,
              priority: credit.priority,
              starting_at_offset: credit.starting_at_offset,
              ...(credit.applicable_product_tags
                ? { applicable_product_tags: credit.applicable_product_tags }
                : {}),
              ...(credit.specifiers ? { specifiers: credit.specifiers } : {}),
              ...(credit.recurrence_frequency
                ? { recurrence_frequency: credit.recurrence_frequency }
                : {}),
              ...(credit.duration ? { duration: credit.duration } : {}),
              ...(credit.name ? { name: credit.name } : {}),
              ...(subscriptionConfig
                ? { subscription_config: subscriptionConfig }
                : {}),
            };
          }
        );

        const overrides = (desired.overrides ?? []).map((o) => {
          const productId = ids.products[o.product_name];
          if (!productId) {
            throw new Error(
              `Product not found for override: ${o.product_name}`
            );
          }
          return {
            starting_at_offset: { unit: "DAYS" as const, value: 0 },
            entitled: o.entitled,
            override_specifiers: [
              {
                product_id: productId,
                // Required when overwriting a SUBSCRIPTION product's flat rate.
                ...(o.billing_frequency
                  ? { billing_frequency: o.billing_frequency }
                  : {}),
              },
            ],
            // Stamp a flat rate on top of the rate-card rate when the override
            // carries a price (rate card defaults seats to a 0 baseline).
            // `type: "OVERWRITE"` is required by Metronome whenever an
            // `overwrite_rate` is present.
            ...(o.price !== undefined
              ? {
                  type: "OVERWRITE" as const,
                  overwrite_rate: {
                    rate_type: "FLAT" as const,
                    price: o.price,
                    ...(o.credit_type_id
                      ? { credit_type_id: o.credit_type_id }
                      : {}),
                  },
                }
              : {}),
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
          ...(recurringCredits.length > 0
            ? { recurring_credits: recurringCredits }
            : {}),
          ...(overrides.length > 0 ? { overrides } : {}),
          ...(desired.scheduled_charges_on_usage_invoices
            ? {
                scheduled_charges_on_usage_invoices:
                  desired.scheduled_charges_on_usage_invoices,
              }
            : {}),
        } as Parameters<typeof client.v1.packages.create>[0]);
        const id = (created as { data: { id: string } }).data.id;
        console.log(`    → ${id}`);
        ids.packages[desired.name] = id;
      } else {
        console.log(`  + [DRYRUN] Would create: ${versionedName}`);
        ids.packages[desired.name] = ex?.id ?? `dryrun-${desired.name}`;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Sync: Custom Fields
// ---------------------------------------------------------------------------

const CUSTOM_FIELD_KEYS: Array<{
  entity: "contract" | "contract_product" | "contract_credit" | "commit";
  key: string;
}> = [
  { entity: "contract", key: "MAU_TIERS" },
  { entity: "contract", key: "MAU_THRESHOLD" },
  { entity: "contract", key: PLAN_CODE_CUSTOM_FIELD_KEY },
  // Stamped on individual contract_credit instances to identify excess
  // recurring credits ("excess") vs. workspace-pool credits ("pool"). Lets
  // the default ContractCredit-balance alerts filter on value="pool" to
  // exclude excess credits from low-balance notifications.
  //
  // The template-level approach (stamping on `package_credit`) does not
  // work: Metronome registers the key but refuses `setValues` with 400
  // "Setting package managed fields is not yet supported". Stamping must
  // happen per-instance at contract provisioning time — see
  // `stampExcessCreditCustomField` in `lib/metronome/contracts.ts`.
  {
    entity: "contract_credit",
    key: CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY,
  },
  // Stamped on each seat-style product (Workspace / Pro / Max / Free).
  // Runtime code reads `product.custom_fields.DUST_SEAT_TYPE` (cached in
  // Redis) instead of comparing product names/IDs, which change on every
  // redeploy. Setting it on the product (vs. on every subscription
  // instance) means existing contracts pick up new tags for free, with no
  // per-contract backfill needed.
  //
  // Note: Metronome's custom-fields API uses `contract_product` for the
  // entity type returned by `v1.contracts.products.list()` — `product` is a
  // legacy plan-product type and 404s on these IDs.
  { entity: "contract_product", key: SEAT_TYPE_CUSTOM_FIELD_KEY },
  // Per-product Stripe product ID. Read by Metronome (via the
  // `invoiceitem.price.product` mapping configured in Metronome's Stripe
  // integration settings) when generating Stripe invoices for
  // payment-gated commits. Populated manually in the Metronome UI per
  // product — this entry only registers the field so the UI exposes it.
  { entity: "contract_product", key: STRIPE_PRODUCT_ID_CUSTOM_FIELD_KEY },
];

async function syncCustomFields(): Promise<void> {
  console.log("\n=== Syncing Custom Fields ===");

  const entities = Array.from(new Set(CUSTOM_FIELD_KEYS.map((f) => f.entity)));

  // Track existing keys per entity — the same key can be registered for
  // multiple entities and each registration is independent.
  const existingKeysByEntity = new Map<string, Set<string>>();
  for (const entity of entities) {
    const keys = new Set<string>();
    for await (const entry of client.v1.customFields.listKeys({
      entities: [entity],
    })) {
      keys.add(entry.key);
    }
    existingKeysByEntity.set(entity, keys);
  }

  for (const field of CUSTOM_FIELD_KEYS) {
    const existing = existingKeysByEntity.get(field.entity) ?? new Set();
    if (existing.has(field.key)) {
      console.log(`  ✓ ${field.entity}.${field.key} — already exists`);
      continue;
    }
    console.log(
      `  + ${EXECUTE ? "Creating" : "[DRYRUN] Would create"}: ${field.entity}.${field.key}`
    );
    if (!EXECUTE) {
      continue;
    }
    await client.v1.customFields.addKey({
      entity: field.entity,
      key: field.key,
      enforce_uniqueness: false,
    });
  }
}

// ---------------------------------------------------------------------------
// Sync: Alerts (default threshold notifications)
// ---------------------------------------------------------------------------

interface AlertDef {
  name: string;
  alert_type:
    | "low_remaining_contract_credit_balance_reached"
    | "low_remaining_commit_balance_reached"
    | "low_remaining_contract_credit_and_commit_balance_reached"
    | "low_remaining_seat_balance_reached";
  threshold: number;
  // Idempotency key — Metronome rejects duplicate creates with the same key.
  uniqueness_key: string;
  // Tag identifying which credit type the threshold tracks. Resolved at sync
  // time (AWU ID differs per environment).
  credit_type: "AWU";
  // Required for `low_remaining_seat_balance_reached` alerts. Scopes the alert
  // to a seat group key; omitting `seat_group_value` fans the alert out across
  // all seats (allocation-independent — e.g. a 0-balance exhaustion alert).
  seat_filter?: {
    seat_group_key: string;
    seat_group_value?: string;
  };
  // Custom field filters scoped to ContractCredit / Commit / Contract. Used
  // here to exclude excess recurring credits from contract-credit-balance
  // alerts (those credits exist solely to absorb over-consumption and would
  // otherwise mask a real depletion of the workspace pool).
  custom_field_filters?: Array<{
    entity: "ContractCredit" | "Commit" | "Contract";
    key: string;
    value: string;
  }>;
}

// Filter that excludes the "excess" recurring credit from
// contract-credit-balance alerts. The inverse marker ("pool") is stamped on
// workspace-pool recurring credits in the package definitions; excess credits
// get "excess" so they don't match this filter.
const POOL_CONTRACT_CREDIT_FILTER: NonNullable<
  AlertDef["custom_field_filters"]
>[number] = {
  entity: "ContractCredit",
  key: CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY,
  value: "pool",
};

// Default alerts applied to all customers (no `customer_id` set on create):
// fire when AWU credit / contract-credit / commit balance reaches thresholds.
const ALERTS: AlertDef[] = [
  {
    name: "Default: Empty contract credit + commit balance (AWU)",
    alert_type: "low_remaining_contract_credit_and_commit_balance_reached",
    threshold: 0,
    uniqueness_key:
      "default-low-contract-credit-and-commit-balance-zero-awu-pooled",
    credit_type: "AWU",
    custom_field_filters: [POOL_CONTRACT_CREDIT_FILTER],
  },
  {
    name: "Default: Low balance 100 credits (AWU)",
    alert_type: "low_remaining_contract_credit_and_commit_balance_reached",
    threshold: 100,
    uniqueness_key:
      "default-low-contract-credit-and-commit-balance-100-awu-pooled",
    credit_type: "AWU",
    custom_field_filters: [POOL_CONTRACT_CREDIT_FILTER],
  },
  {
    name: "Default: Critical balance 10 credits (AWU)",
    alert_type: "low_remaining_contract_credit_and_commit_balance_reached",
    threshold: 10,
    uniqueness_key:
      "default-low-contract-credit-and-commit-balance-10-awu-pooled",
    credit_type: "AWU",
    custom_field_filters: [POOL_CONTRACT_CREDIT_FILTER],
  },
  {
    // Seat exhaustion: fires at 0 remaining seat balance. Allocation-independent
    // (no `seat_group_value`) so the single default alert fans out across every
    // seat of every customer. Seat ids in Metronome are user sIds, hence the
    // "user_id" group key.
    name: "Default: Empty seat balance (AWU)",
    alert_type: "low_remaining_seat_balance_reached",
    threshold: 0,
    uniqueness_key: "default-low-seat-balance-zero-awu",
    credit_type: "AWU",
    seat_filter: { seat_group_key: "user_id" },
  },
];

async function syncAlerts(): Promise<void> {
  console.log("\n=== Syncing Alerts ===");

  for (const desired of ALERTS) {
    const creditTypeId =
      desired.credit_type === "AWU" ? getCreditTypeAwuId() : undefined;

    if (!EXECUTE) {
      console.log(
        `  + [DRYRUN] Would create alert: ${desired.name} (${desired.alert_type}, threshold=${desired.threshold})`
      );
      continue;
    }

    try {
      const created = await client.v1.alerts.create({
        name: desired.name,
        alert_type: desired.alert_type,
        threshold: desired.threshold,
        uniqueness_key: desired.uniqueness_key,
        credit_type_id: creditTypeId,
        ...(desired.custom_field_filters
          ? { custom_field_filters: desired.custom_field_filters }
          : {}),
        ...(desired.seat_filter ? { seat_filter: desired.seat_filter } : {}),
      });
      const id = (created as { data: { id: string } }).data.id;
      console.log(`  + Created: ${desired.name} → ${id}`);
    } catch (err) {
      // Metronome returns 409 when uniqueness_key already exists.
      const status = (err as { status?: number })?.status;
      if (status === 409) {
        console.log(
          `  ✓ ${desired.name} — already exists (uniqueness_key="${desired.uniqueness_key}")`
        );
      } else {
        throw err;
      }
    }
  }
}

async function main(): Promise<void> {
  const env = await detectEnvironment();
  setMetronomeEnv(env);
  console.log(
    `Metronome Setup — environment: ${env}, mode: ${EXECUTE ? "EXECUTE" : "DRY-RUN (pass --execute to apply)"}\n`
  );

  console.log(
    `Credit types: USD=${CREDIT_TYPE_USD_ID}, AWU=${getCreditTypeAwuId()}, PROG_USD=${getCreditTypeProgrammaticUsdId()}`
  );

  await syncCustomFields();
  await syncMetrics();
  const productsMutated = await syncProducts();
  await syncRateCards();
  await syncPackages();
  await syncAlerts();

  // Drop the cached `productId → seatType` map so live processes pick up
  // tag changes immediately rather than waiting for the 6h TTL. Only needed
  // when products were created, archived, or had custom_fields updated —
  // rate-card / package / alert changes don't affect the map. Skipping the
  // call on no-op runs also avoids the Redis connection error on hosts where
  // Redis isn't reachable.
  if (EXECUTE && productsMutated) {
    try {
      await invalidateProductSeatTypesCache();
      console.log("\n✓ Cleared product seat-type cache");
    } catch (err) {
      console.warn("Failed to invalidate product seat-type cache:", err);
    }
  }

  if (!EXECUTE) {
    console.log("\n✓ Dry-run complete. Pass --execute to apply changes.");
    return;
  }

  console.log("\n=== ID Summary ===");
  for (const [category, map] of Object.entries(ids)) {
    console.log(`\n${category}:`);
    for (const [name, id] of Object.entries(map)) {
      console.log(`  ${name}: ${id}`);
    }
  }

  // Output all IDs as TypeScript constants — paste into lib/metronome/constants.ts.
  function toConstName(prefix: string, name: string): string {
    return `${prefix}_${name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")}`;
  }

  const envPrefix = env === "production" ? "PROD" : "DEV";
  console.log(
    `\n=== TypeScript constants (${env}) — paste into lib/metronome/constants.ts ===\n`
  );

  console.log("// Metrics");
  for (const [name, id] of Object.entries(ids.metrics)) {
    console.log(`const ${toConstName(envPrefix + "_METRIC", name)} = "${id}";`);
  }

  console.log("\n// Products");
  for (const [name, id] of Object.entries(ids.products)) {
    console.log(
      `const ${toConstName(envPrefix + "_PRODUCT", name)} = "${id}";`
    );
  }

  console.log("\n✓ Done");
}

void main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
