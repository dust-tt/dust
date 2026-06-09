import config from "@app/lib/api/config";
import {
  CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY,
  CONTRACT_CREDIT_TYPE_POOL,
  PLAN_CODE_CUSTOM_FIELD_KEY,
  SEAT_TYPE_CUSTOM_FIELD_KEY,
} from "@app/lib/metronome/constants";
import logger from "@app/logger/logger";
import type { SupportedCurrency } from "@app/types/currency";
import type { MembershipSeatType } from "@app/types/memberships";
import { isMembershipSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import Metronome, { ConflictError } from "@metronome/sdk";
import type { Commit, ContractV2, Credit, V1 } from "@metronome/sdk/resources";
import type { ContractRetrieveRateScheduleResponse } from "@metronome/sdk/resources/v1/contracts/contracts";
import type { ProductListResponse } from "@metronome/sdk/resources/v1/contracts/products";
import type { RateCardRetrieveResponse } from "@metronome/sdk/resources/v1/contracts/rate-cards";
import type {
  CustomerAlert,
  Invoice,
} from "@metronome/sdk/resources/v1/customers";
import type { ContractEditParams } from "@metronome/sdk/resources/v2/contracts";
import type { IncomingHttpHeaders } from "http";
import type {
  MetronomeBalance,
  MetronomeEvent,
  MetronomePackageTier,
  MetronomeSeatBalance,
  MetronomeStripeCollectionMethod,
  MetronomeUsageListResponse,
  MetronomeUsageWithGroupsResponse,
} from "./types";
import {
  classifyMetronomePackageByName,
  classifyMetronomePackageCurrencyByName,
  DEFAULT_METRONOME_STRIPE_COLLECTION_METHOD,
  isMetronomeSeatBalance,
} from "./types";

let cachedClient: Metronome | null = null;

export function getMetronomeClient(): Metronome {
  if (!cachedClient) {
    const bearerToken = config.getMetronomeApiKey();
    if (!bearerToken) {
      throw new Error("METRONOME_API_KEY is not set");
    }
    cachedClient = new Metronome({ bearerToken });
  }
  return cachedClient;
}

// Metronome requires dates on specific boundaries (hour for contracts, midnight for usage).
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export function floorToHourISO(date: Date): string {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS).toISOString();
}

/** Convert an epoch-seconds timestamp (e.g. from Stripe) to an hour-floored ISO string. */
export function epochSecondsToFloorHourISO(epochSeconds: number): string {
  return floorToHourISO(new Date(epochSeconds * 1000));
}

export function ceilToHourISO(date: Date): string {
  return new Date(Math.ceil(date.getTime() / HOUR_MS) * HOUR_MS).toISOString();
}

export function floorToMidnightUTC(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

export function ceilToMidnightUTC(d: Date): Date {
  const floored = floorToMidnightUTC(d);
  return floored.getTime() < d.getTime()
    ? new Date(floored.getTime() + DAY_MS)
    : floored;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/**
 * Verify a Metronome webhook signature and return the parsed payload as an
 * unknown — callers schema-check it. Throws if the signature is invalid.
 */
export function unwrapMetronomeWebhook(
  rawBody: string,
  headers: IncomingHttpHeaders,
  secret: string
): unknown {
  return getMetronomeClient().webhooks.unwrap(rawBody, headers, secret);
}

// ---------------------------------------------------------------------------
// Event ingestion
// ---------------------------------------------------------------------------

const METRONOME_INGEST_BATCH_SIZE = 100;

/**
 * Send usage events to Metronome's ingest API.
 * Batches into chunks of 100 (Metronome's max per request).
 * Throws on failure so callers (e.g. Temporal activities) can retry.
 */
export async function ingestMetronomeEvents(
  events: MetronomeEvent[]
): Promise<void> {
  if (!config.getMetronomeApiKey() || events.length === 0) {
    return;
  }

  // Metronome rejects events older than 34 days — filter them out before
  // sending to avoid rejecting the entire batch. This happens when Temporal
  // retries old workflows.
  const maxAgeMs = 34 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAgeMs;
  const validEvents = events.filter((e) => {
    const ts = new Date(e.timestamp).getTime();
    if (ts < cutoff) {
      logger.warn(
        { transactionId: e.transaction_id, timestamp: e.timestamp },
        "[Metronome] Dropping event — older than 34 days"
      );
      return false;
    }
    return true;
  });

  if (validEvents.length === 0) {
    return;
  }

  const client = getMetronomeClient();
  try {
    for (let i = 0; i < validEvents.length; i += METRONOME_INGEST_BATCH_SIZE) {
      const batch = validEvents.slice(i, i + METRONOME_INGEST_BATCH_SIZE);
      await client.v1.usage.ingest({ usage: batch });
    }
  } catch (err) {
    logger.error(
      { error: normalizeError(err), eventCount: validEvents.length },
      "[Metronome] Failed to ingest usage events"
    );
    throw err;
  }
  logger.info(
    { eventCount: validEvents.length },
    "[Metronome] Ingested usage events"
  );
}

// ---------------------------------------------------------------------------
// Customer management
// ---------------------------------------------------------------------------

/**
 * Resolves how to address the Stripe billing-provider delivery method on a
 * customer config. When the Metronome org has multiple Stripe
 * DIRECT_TO_BILLING_PROVIDER connections, Metronome rejects the bare
 * `delivery_method` and requires an explicit `delivery_method_id`; set
 * METRONOME_STRIPE_DELIVERY_METHOD_ID to pin the intended connection (find ids
 * with `scripts/list_metronome_delivery_methods.ts`). With a single connection
 * (e.g. prod) the env var stays unset and the bare delivery_method resolves
 * unambiguously.
 */
function stripeDeliveryMethod():
  | { delivery_method_id: string }
  | { delivery_method: "direct_to_billing_provider" } {
  const deliveryMethodId = config.getMetronomeStripeDeliveryMethodId();
  return deliveryMethodId
    ? { delivery_method_id: deliveryMethodId }
    : { delivery_method: "direct_to_billing_provider" };
}

/**
 * Create a customer in Metronome, linked to an existing Stripe customer.
 * The workspace sId is set as an ingest alias so that usage events
 * with `customer_id: workspaceId` are automatically matched.
 *
 * Handles 409 conflict by extracting the existing customer's ID.
 */
export async function createMetronomeCustomer({
  workspaceId,
  workspaceName,
  stripeCustomerId,
  stripeCollectionMethod = DEFAULT_METRONOME_STRIPE_COLLECTION_METHOD,
}: {
  workspaceId: string;
  workspaceName: string;
  stripeCustomerId?: string;
  stripeCollectionMethod?: MetronomeStripeCollectionMethod;
}): Promise<Result<{ metronomeCustomerId: string }, Error>> {
  try {
    const response = await getMetronomeClient().v1.customers.create({
      name: workspaceName,
      ingest_aliases: [workspaceId],
      ...(stripeCustomerId
        ? {
            customer_billing_provider_configurations: [
              {
                billing_provider: "stripe",
                ...stripeDeliveryMethod(),
                configuration: {
                  stripe_customer_id: stripeCustomerId,
                  stripe_collection_method: stripeCollectionMethod,
                },
              },
            ],
          }
        : {}),
    });

    logger.info(
      { workspaceId, metronomeCustomerId: response.data.id },
      "[Metronome] Customer created"
    );
    return new Ok({ metronomeCustomerId: response.data.id });
  } catch (err) {
    if (err instanceof ConflictError) {
      const findResult = await findMetronomeCustomerByAlias(workspaceId);
      if (findResult.isOk() && findResult.value) {
        return new Ok({ metronomeCustomerId: findResult.value });
      }
    }

    const error = normalizeError(err);
    logger.error(
      { error, workspaceId },
      "[Metronome] Failed to create customer"
    );
    return new Err(error);
  }
}

/**
 * Update the display name of an existing Metronome customer.
 * Used to keep the Metronome customer name in sync when a workspace is renamed.
 */
export async function updateMetronomeCustomerName(
  workspace: LightWorkspaceType
): Promise<Result<void, Error>> {
  const { metronomeCustomerId, name } = workspace;
  if (!metronomeCustomerId) {
    return new Ok(undefined);
  }

  try {
    await getMetronomeClient().v1.customers.setName({
      customer_id: metronomeCustomerId,
      name,
    });
    logger.info(
      { metronomeCustomerId, name },
      "[Metronome] Customer name updated"
    );
    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, name },
      "[Metronome] Failed to update customer name"
    );
    return new Err(error);
  }
}

/**
 * Resolves the Stripe customer ID linked to a Metronome customer's active
 * Stripe billing configuration. Returns `null` when no active Stripe
 * configuration is set on the customer. Mirrors the read used by
 * `ensureMetronomeStripeBillingConfig`.
 */
export async function getMetronomeCustomerStripeCustomerId(
  metronomeCustomerId: string
): Promise<Result<string | null, Error>> {
  try {
    const configs =
      await getMetronomeClient().v1.customers.retrieveBillingConfigurations({
        customer_id: metronomeCustomerId,
      });
    const activeStripeConfig = configs.data.find(
      (c) => c.billing_provider === "stripe" && !c.archived_at
    );
    const stripeCustomerId =
      activeStripeConfig?.configuration?.stripe_customer_id;
    return new Ok(
      typeof stripeCustomerId === "string" ? stripeCustomerId : null
    );
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/**
 * Idempotently ensure a Metronome customer has a Stripe billing
 * configuration pointing to the given `stripeCustomerId`.
 *
 * - No active Stripe config: adds one.
 * - Active Stripe config already pointing to `stripeCustomerId` with the same
 *   collection method: no-op.
 * - Active Stripe config pointing to a different `stripeCustomerId` or using a
 *   different collection method: archives the stale config(s) and adds a new
 *   one (covers a recreated Stripe customer or a collection-method change).
 */
export async function ensureMetronomeStripeBillingConfig({
  metronomeCustomerId,
  stripeCustomerId,
  stripeCollectionMethod = DEFAULT_METRONOME_STRIPE_COLLECTION_METHOD,
}: {
  metronomeCustomerId: string;
  stripeCustomerId: string;
  stripeCollectionMethod?: MetronomeStripeCollectionMethod;
}): Promise<Result<void, Error>> {
  try {
    const existing =
      await getMetronomeClient().v1.customers.retrieveBillingConfigurations({
        customer_id: metronomeCustomerId,
      });

    const activeStripeConfigs = existing.data.filter(
      (c) => c.billing_provider === "stripe" && !c.archived_at
    );

    const alreadyCorrect = activeStripeConfigs.some(
      (c) =>
        c.configuration?.stripe_customer_id === stripeCustomerId &&
        c.configuration?.stripe_collection_method === stripeCollectionMethod
    );
    if (alreadyCorrect) {
      return new Ok(undefined);
    }

    if (activeStripeConfigs.length > 0) {
      const staleIds = activeStripeConfigs.map((c) => c.id);
      await getMetronomeClient().v1.customers.archiveBillingConfigurations({
        customer_id: metronomeCustomerId,
        customer_billing_provider_configuration_ids: staleIds,
      });
      logger.warn(
        {
          metronomeCustomerId,
          stripeCustomerId,
          archivedConfigIds: staleIds,
          stalestripeCustomerIds: activeStripeConfigs.map(
            (c) => c.configuration?.stripe_customer_id
          ),
        },
        "[Metronome] Archived stale Stripe billing config(s) before re-adding"
      );
    }

    await getMetronomeClient().v1.customers.setBillingConfigurations({
      data: [
        {
          customer_id: metronomeCustomerId,
          billing_provider: "stripe",
          ...stripeDeliveryMethod(),
          configuration: {
            stripe_customer_id: stripeCustomerId,
            stripe_collection_method: stripeCollectionMethod,
          },
        },
      ],
    });

    logger.info(
      { metronomeCustomerId, stripeCustomerId, stripeCollectionMethod },
      "[Metronome] Stripe billing config added to customer"
    );
    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, stripeCustomerId },
      "[Metronome] Failed to ensure Stripe billing config on customer"
    );
    return new Err(error);
  }
}

/**
 * Find a Metronome customer by ingest alias (workspace sId).
 * Returns the Metronome customer ID if found, null if not.
 */
export async function findMetronomeCustomerByAlias(
  workspaceId: string
): Promise<Result<string | null, Error>> {
  try {
    const page = await getMetronomeClient().v1.customers.list({
      ingest_alias: workspaceId,
    });
    const first = page.data[0];
    return new Ok(first?.id ?? null);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, workspaceId },
      "[Metronome] Failed to find customer by alias"
    );
    return new Err(error);
  }
}

/**
 * Add Stripe billing configuration from the Metronome customer to the contract
 * Idempotent: if Stripe billing is already configured, logs and returns Ok.
 */
export async function addStripeMetronomeBillingConfig({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
}): Promise<Result<void, Error>> {
  try {
    await getMetronomeClient().v2.contracts.edit({
      customer_id: metronomeCustomerId,
      contract_id: metronomeContractId,
      add_billing_provider_configuration_update: {
        billing_provider_configuration: {
          billing_provider: "stripe",
          delivery_method: "direct_to_billing_provider",
        },
        schedule: {
          effective_at: "START_OF_CURRENT_PERIOD",
        },
      },
    });

    logger.info(
      {
        metronomeCustomerId,
        metronomeContractId,
      },
      "[Metronome] Stripe billing provider linked to contract"
    );

    return new Ok(undefined);
  } catch (err) {
    if (err instanceof ConflictError) {
      logger.info(
        { metronomeCustomerId, metronomeContractId },
        "[Metronome] Contract billing provider already configured, skipping"
      );

      return new Ok(undefined);
    }

    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, metronomeContractId },
      "[Metronome] Failed to link Stripe billing provider to contract"
    );

    return new Err(error);
  }
}

// ---------------------------------------------------------------------------
// Package management
// ---------------------------------------------------------------------------

/**
 * Compact summary of a Metronome package, used by Poke to let an operator
 * pick which package to put a customer on. Only classifiable packages are
 * included — `listMetronomePackages` filters out anything whose name
 * doesn't match a known tier keyword (with a warning log).
 */
export interface MetronomePackageSummary {
  id: string;
  name: string;
  aliases: string[];
  rateCardId?: string;
  tier: MetronomePackageTier;
  currency: SupportedCurrency;
  seats: PackageSeatConfig[];
}

/**
 * A seat type that can be sold on a package. `entitled` reflects whether the
 * package flips this seat on by default (via an `entitled: true` override);
 * non-entitled seats are still surfaced so an operator can opt into entitling
 * them when switching the contract. `defaultRate` is the per-seat flat rate
 * stamped by the package's entitlement override (in the rate card's fiat unit,
 * e.g. cents for USD); it is null when the seat is not entitled, or entitled
 * without an explicit rate. `productId` is the Metronome seat product the
 * override targets — used to apply a rate/entitlement override on the
 * provisioned contract.
 */
export interface PackageSeatConfig {
  seatType: MembershipSeatType;
  productId: string;
  productName: string;
  defaultRate: number | null;
  entitled: boolean;
}

// Structural shape of the package list-response overrides we read — only the
// fields needed to resolve entitled seat products and their flat rate.
type PackageEntitlementOverride = {
  entitled?: boolean;
  product?: { id?: string };
  override_specifiers?: Array<{ product_id?: string }>;
  overwrite_rate?: { price?: number };
};

/**
 * Resolve every seat a package can sell, flagging which ones it entitles by
 * default. A package flips `entitled: true` on the seat products it sells (and
 * stamps their flat rate via `overwrite_rate`); those become `entitled` seats
 * with their default rate. Every other known seat product is surfaced as a
 * non-entitled seat (no default rate) so an operator can opt into entitling it
 * when switching the contract.
 */
// `productId → { seatType, name }` for all seat products.
type SeatProductInfo = { seatType: MembershipSeatType; name: string };

function seatConfigsFromPackageOverrides(
  overrides: PackageEntitlementOverride[] | undefined,
  seatProducts: Map<string, SeatProductInfo>
): PackageSeatConfig[] {
  const bySeatType = new Map<MembershipSeatType, PackageSeatConfig>();

  // First pass: the seats the package entitles, with their default rate.
  for (const override of overrides ?? []) {
    if (override.entitled !== true) {
      continue;
    }
    const productIds = [
      override.product?.id,
      ...(override.override_specifiers ?? []).map((s) => s.product_id),
    ];
    for (const productId of productIds) {
      const info = productId ? seatProducts.get(productId) : undefined;
      if (productId && info && !bySeatType.has(info.seatType)) {
        bySeatType.set(info.seatType, {
          seatType: info.seatType,
          productId,
          productName: info.name,
          defaultRate: override.overwrite_rate?.price ?? null,
          entitled: true,
        });
      }
    }
  }

  // Second pass: every remaining seat product, surfaced as not entitled so the
  // operator can opt into it.
  for (const [productId, info] of seatProducts) {
    if (!bySeatType.has(info.seatType)) {
      bySeatType.set(info.seatType, {
        seatType: info.seatType,
        productId,
        productName: info.name,
        defaultRate: null,
        entitled: false,
      });
    }
  }

  return [...bySeatType.values()].sort((a, b) =>
    a.seatType.localeCompare(b.seatType)
  );
}

/**
 * Build a `productId → { seatType, name }` map from all Metronome products
 * tagged with the `DUST_SEAT_TYPE` custom field. Returns an empty map (and
 * logs) on error so package listing degrades gracefully rather than failing
 * entirely.
 *
 * Kept inline here (rather than reusing `seat_types.getProductSeatTypes`) to
 * avoid a `client ↔ seat_types` import cycle.
 */
async function buildProductSeatTypeMap(): Promise<
  Map<string, SeatProductInfo>
> {
  const result = new Map<string, SeatProductInfo>();
  const productsResult = await listMetronomeProducts();
  if (productsResult.isErr()) {
    logger.warn(
      { error: productsResult.error },
      "[Metronome] Failed to resolve product seat types for package listing"
    );
    return result;
  }
  for (const product of productsResult.value) {
    const value = product.custom_fields?.[SEAT_TYPE_CUSTOM_FIELD_KEY];
    if (value && isMembershipSeatType(value)) {
      result.set(product.id, {
        seatType: value,
        name: product.current?.name ?? "",
      });
    }
  }
  return result;
}

// Cache the package list for a few minutes as the catalog rarely changes and
// the dialog may open many times.
const PACKAGE_LIST_CACHE_TTL_MS = 5 * 60 * 1000;
let packageListCache: {
  expiresAtMs: number;
  packages: MetronomePackageSummary[];
} | null = null;

const TIER_SORT_ORDER: Record<MetronomePackageTier, number> = {
  enterprise: 0,
  business: 1,
  pro: 2,
  free: 3,
};
const CURRENCY_SORT_ORDER: Record<SupportedCurrency, number> = {
  usd: 0,
  eur: 1,
};

function comparePackagesForDisplay(
  a: MetronomePackageSummary,
  b: MetronomePackageSummary
): number {
  const tierDelta = TIER_SORT_ORDER[a.tier] - TIER_SORT_ORDER[b.tier];
  if (tierDelta !== 0) {
    return tierDelta;
  }
  const currencyDelta =
    CURRENCY_SORT_ORDER[a.currency] - CURRENCY_SORT_ORDER[b.currency];
  if (currencyDelta !== 0) {
    return currencyDelta;
  }
  return a.name.localeCompare(b.name);
}

/**
 * List all Metronome packages on the account. Cached for 5 minutes.
 */
export async function listMetronomePackages(): Promise<
  Result<MetronomePackageSummary[], Error>
> {
  if (packageListCache && packageListCache.expiresAtMs > Date.now()) {
    return new Ok(packageListCache.packages);
  }

  try {
    const productSeatTypes = await buildProductSeatTypeMap();
    const packages: MetronomePackageSummary[] = [];
    for await (const pkg of getMetronomeClient().v1.packages.list()) {
      const aliases = pkg.aliases?.map((a) => a.name) ?? [];
      const name = pkg.name ?? "";
      const tier = classifyMetronomePackageByName(name);
      if (tier === null) {
        logger.warn(
          { packageId: pkg.id, packageName: name, aliases },
          "[Metronome] Package name has no recognized tier keyword (pro/business/enterprise); package will be hidden in Poke."
        );
        continue;
      }
      packages.push({
        id: pkg.id,
        name,
        aliases,
        rateCardId: pkg.rate_card_id ?? undefined,
        tier,
        currency: classifyMetronomePackageCurrencyByName(name),
        seats: seatConfigsFromPackageOverrides(pkg.overrides, productSeatTypes),
      });
    }
    packages.sort(comparePackagesForDisplay);
    packageListCache = {
      expiresAtMs: Date.now() + PACKAGE_LIST_CACHE_TTL_MS,
      packages,
    };
    return new Ok(packages);
  } catch (err) {
    const error = normalizeError(err);
    logger.error({ error }, "[Metronome] Failed to list packages");
    return new Err(error);
  }
}

/** Set custom field values on a Metronome contract. */
export async function setMetronomeContractCustomFields({
  contractId,
  customFields,
}: {
  contractId: string;
  customFields: Record<string, string>;
}): Promise<Result<void, Error>> {
  try {
    await getMetronomeClient().v1.customFields.setValues({
      entity: "contract",
      entity_id: contractId,
      custom_fields: customFields,
    });
    return new Ok(undefined);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/** Set custom field values on a Metronome contract credit. */
export async function setMetronomeContractCreditCustomFields({
  creditId,
  customFields,
}: {
  creditId: string;
  customFields: Record<string, string>;
}): Promise<Result<void, Error>> {
  try {
    await getMetronomeClient().v1.customFields.setValues({
      entity: "contract_credit",
      entity_id: creditId,
      custom_fields: customFields,
    });
    return new Ok(undefined);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

// ---------------------------------------------------------------------------
// Contract management
// ---------------------------------------------------------------------------

/**
 * Create a contract for a Metronome customer using a package alias.
 * The package defines the rate card, seat subscriptions, and credit allocations.
 *
 * Handles 409 conflict by extracting the existing contract's ID.
 */
export async function createMetronomeContract({
  metronomeCustomerId,
  packageAlias,
  packageId,
  uniquenessKey,
  startingAt,
  enableStripeBilling,
  planCode,
  additionalCustomFields,
}: {
  metronomeCustomerId: string;
  /** Mutually exclusive with `packageId`. */
  packageAlias?: string;
  /** Mutually exclusive with `packageAlias` */
  packageId?: string;
  uniquenessKey?: string;
  // Must already be on an hour boundary (Metronome requirement).
  startingAt: Date;
  enableStripeBilling: boolean;
  // Stamps PLAN_CODE_CUSTOM_FIELD_KEY on the contract so the contract.start
  // webhook can swap the workspace's subscription onto this plan when the
  // contract becomes active.
  planCode: string;
  // Additional custom fields merged with PLAN_CODE_CUSTOM_FIELD_KEY when
  // stamping the contract. Used to signal payment-gated activation flows
  // (DUST_PAYMENT_GATE_TYPE) so the contract.start webhook can skip the
  // automatic subscription swap.
  additionalCustomFields?: Record<string, string>;
}): Promise<Result<{ contractId: string }, Error>> {
  if (!packageAlias === !packageId) {
    return new Err(
      new Error(
        "createMetronomeContract requires exactly one of packageAlias or packageId."
      )
    );
  }
  const startingAtISO = startingAt.toISOString();
  const packageLabel = packageAlias ?? packageId!;

  // Resolve the contract id from either a fresh create or a 409 recovery.
  // We split this from the post-create steps (Stripe billing config, PLAN_CODE
  // stamp) so those steps run on retry too — they're idempotent on Metronome's
  // side, and re-running them is what makes the overall function recoverable.
  let contractId: string;
  let recovered = false;
  try {
    const response = await getMetronomeClient().v1.contracts.create({
      customer_id: metronomeCustomerId,
      ...(packageAlias ? { package_alias: packageAlias } : {}),
      ...(packageId ? { package_id: packageId } : {}),
      starting_at: startingAtISO,
      ...(uniquenessKey ? { uniqueness_key: uniquenessKey } : {}),
    });
    contractId = response.data.id;
  } catch (err) {
    if (err instanceof ConflictError) {
      // Prefer uniqueness_key lookup when the caller provided one — this is
      // the only safe recovery path when creating by package_id (multiple
      // contracts may coexist on the customer). Falls back to "most recent
      // active" for legacy alias-only callers without a uniqueness_key.
      if (uniquenessKey) {
        const existing = await findMetronomeContractByUniquenessKey({
          metronomeCustomerId,
          uniquenessKey,
        });
        if (existing.isOk() && existing.value) {
          contractId = existing.value.contractId;
          recovered = true;
        } else {
          return new Err(normalizeError(err));
        }
      } else if (packageAlias) {
        const existing = await getMetronomeActiveContract(metronomeCustomerId);
        if (existing.isOk() && existing.value) {
          contractId = existing.value.contractId;
          recovered = true;
        } else {
          return new Err(normalizeError(err));
        }
      } else {
        return new Err(normalizeError(err));
      }
    } else {
      const error = normalizeError(err);
      logger.error(
        { error, metronomeCustomerId, package: packageLabel },
        "[Metronome] Failed to create contract"
      );
      return new Err(error);
    }
  }

  if (enableStripeBilling) {
    addStripeMetronomeBillingConfig({
      metronomeCustomerId,
      metronomeContractId: contractId,
    });
  }

  const customFieldsResult = await setMetronomeContractCustomFields({
    contractId,
    customFields: {
      [PLAN_CODE_CUSTOM_FIELD_KEY]: planCode,
      ...additionalCustomFields,
    },
  });
  if (customFieldsResult.isErr()) {
    return new Err(customFieldsResult.error);
  }

  logger.info(
    {
      metronomeCustomerId,
      package: packageLabel,
      metronomeContractId: contractId,
      planCode,
      recovered,
    },
    recovered
      ? "[Metronome] Contract recovered"
      : "[Metronome] Contract created"
  );
  return new Ok({ contractId });
}

/**
 * Get the active contract for a Metronome customer.
 * Returns the contract ID if found.
 */
export async function getMetronomeActiveContract(
  metronomeCustomerId: string
): Promise<
  Result<
    {
      contractId: string;
    } | null,
    Error
  >
> {
  try {
    const response = await getMetronomeClient().v2.contracts.list({
      customer_id: metronomeCustomerId,
    });

    if (response.data.length === 0) {
      return new Ok(null);
    }

    // Take the most recent contract.
    const contract = response.data[0];

    return new Ok({
      contractId: contract.id,
    });
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId },
      "[Metronome] Failed to list contracts"
    );
    return new Err(error);
  }
}

/**
 * Retrieve a specific Metronomome rate card by ID.
 */
export async function getMetronomeRateCardById({
  rateCardId,
}: {
  rateCardId: string;
}): Promise<Result<RateCardRetrieveResponse.Data, Error>> {
  try {
    const response = await getMetronomeClient().v1.contracts.rateCards.retrieve(
      { id: rateCardId }
    );
    return new Ok(response.data);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/**
 * List contracts for a Metronome customer. Archived contracts are excluded
 * by default (Metronome API default). Pass `coveringDate` to restrict the
 * response to contracts active at that point in time.
 */
export async function listMetronomeContracts(
  metronomeCustomerId: string,
  { coveringDate }: { coveringDate?: Date } = {}
): Promise<Result<ContractV2[], Error>> {
  try {
    const response = await getMetronomeClient().v2.contracts.list({
      customer_id: metronomeCustomerId,
      ...(coveringDate ? { covering_date: coveringDate.toISOString() } : {}),
    });
    return new Ok(response.data);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId },
      "[Metronome] Failed to list contracts"
    );
    return new Err(error);
  }
}

/**
 * Find a contract on a Metronome customer by its uniqueness_key. Used to
 * recover the id after a 409 conflict on creation, regardless of whether
 * the create call used package_alias or package_id.
 */
export async function findMetronomeContractByUniquenessKey({
  metronomeCustomerId,
  uniquenessKey,
}: {
  metronomeCustomerId: string;
  uniquenessKey: string;
}): Promise<Result<{ contractId: string } | null, Error>> {
  const result = await listMetronomeContracts(metronomeCustomerId);
  if (result.isErr()) {
    return result;
  }
  const match = result.value.find((c) => c.uniqueness_key === uniquenessKey);
  return new Ok(match ? { contractId: match.id } : null);
}

/**
 * Retrieve a specific Metronome contract by customer + contract ID.
 */
export async function getMetronomeContractById({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
}): Promise<Result<ContractV2, Error>> {
  try {
    const response = await getMetronomeClient().v2.contracts.retrieve({
      customer_id: metronomeCustomerId,
      contract_id: metronomeContractId,
    });

    return new Ok(response.data);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/**
 * Schedule a Metronome contract to end at the given date (defaults to now).
 * Metronome requires ending_before on an hour boundary; we ceil to avoid
 * dropping usage in the current partial hour.
 */
export async function scheduleMetronomeContractEnd({
  metronomeCustomerId,
  contractId,
  endingBefore,
}: {
  metronomeCustomerId: string;
  contractId: string;
  endingBefore?: Date;
}): Promise<Result<void, Error>> {
  const endDate = ceilToHourISO(endingBefore ?? new Date());
  try {
    await getMetronomeClient().v1.contracts.updateEndDate({
      customer_id: metronomeCustomerId,
      contract_id: contractId,
      ending_before: endDate,
    });

    logger.info(
      { metronomeCustomerId, contractId, endingBefore: endDate },
      "[Metronome] Contract end date scheduled"
    );
    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, contractId, endingBefore: endDate },
      "[Metronome] Failed to schedule contract end date"
    );
    return new Err(error);
  }
}

/**
 * Remove the scheduled end date on a Metronome contract, making it open-ended.
 * Used when a subscription is reactivated after cancellation.
 */
export async function reactivateMetronomeContract({
  metronomeCustomerId,
  contractId,
}: {
  metronomeCustomerId: string;
  contractId: string;
}): Promise<Result<void, Error>> {
  try {
    await getMetronomeClient().v1.contracts.updateEndDate({
      customer_id: metronomeCustomerId,
      contract_id: contractId,
    });

    logger.info(
      { metronomeCustomerId, contractId },
      "[Metronome] Contract reactivated (end date removed)"
    );
    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, contractId },
      "[Metronome] Failed to reactivate contract"
    );
    return new Err(error);
  }
}

/**
 * Permanently archive a Metronome contract along with its commits and credits.
 * Used to undo a not-yet-started contract (e.g. cancelling a pending contract
 * switch). `voidInvoices` voids any finalized invoices generated for the
 * contract — safe to set for a future-dated contract that has not billed yet.
 */
export async function archiveMetronomeContract({
  metronomeCustomerId,
  contractId,
  voidInvoices = true,
}: {
  metronomeCustomerId: string;
  contractId: string;
  voidInvoices?: boolean;
}): Promise<Result<void, Error>> {
  try {
    await getMetronomeClient().v1.contracts.archive({
      customer_id: metronomeCustomerId,
      contract_id: contractId,
      void_invoices: voidInvoices,
    });

    logger.info(
      { metronomeCustomerId, contractId, voidInvoices },
      "[Metronome] Contract archived"
    );
    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, contractId },
      "[Metronome] Failed to archive contract"
    );
    return new Err(error);
  }
}

/**
 * Generic wrapper around `v2.contracts.edit`. The Metronome edit endpoint is
 * an omnibus mutation (add subscriptions, commits, credits, overrides, billing
 * provider, etc.) — callers compose the body and we surface the resulting
 * edit id (or error) without prescribing the payload shape.
 */
export async function editMetronomeContract(
  params: ContractEditParams
): Promise<Result<{ editId: string }, Error>> {
  try {
    const response = await getMetronomeClient().v2.contracts.edit(params);
    return new Ok({ editId: response.data.id });
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      {
        error,
        metronomeCustomerId: params.customer_id,
        contractId: params.contract_id,
      },
      "[Metronome] Failed to edit contract"
    );
    return new Err(error);
  }
}

/**
 * Lazily iterate the rate-schedule entries for a contract at a given
 * timestamp. Yields one entry at a time, fetching pages on demand —
 * callers can `break` early once they've found what they need without
 * dragging extra pages over the wire. Errors thrown by the SDK surface
 * through the iterator; wrap with try/catch + Result.
 */
export async function* listMetronomeContractRateSchedule({
  metronomeCustomerId,
  metronomeContractId,
  at,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
  at: string;
}): AsyncGenerator<ContractRetrieveRateScheduleResponse.Data> {
  const client = getMetronomeClient();
  let nextPage: string | null | undefined = undefined;
  do {
    const response = await client.v1.contracts.retrieveRateSchedule({
      contract_id: metronomeContractId,
      customer_id: metronomeCustomerId,
      at,
      ...(nextPage ? { next_page: nextPage } : {}),
    });
    for (const entry of response.data ?? []) {
      yield entry;
    }
    nextPage = response.next_page;
  } while (nextPage);
}

/**
 * Get the package aliases for a contract.
 * Retrieves the contract to get its package_id, then retrieves the package
 * to get its aliases.
 */
export async function getMetronomeContractPackageAliases({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
}): Promise<Result<string[], Error>> {
  try {
    // Use v1.contracts.retrieve: only v1 exposes package_id on the response
    // (Shared.Contract.package_id). v2.contracts.retrieve omits it.
    const contractResponse = await getMetronomeClient().v1.contracts.retrieve({
      customer_id: metronomeCustomerId,
      contract_id: metronomeContractId,
    });

    const packageId = contractResponse.data.package_id;
    if (!packageId) {
      return new Ok([]);
    }

    const packageResponse = await getMetronomeClient().v1.packages.retrieve({
      package_id: packageId,
    });

    const aliases = packageResponse.data.aliases?.map((a) => a.name) ?? [];

    return new Ok(aliases);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, metronomeContractId },
      "[Metronome] Failed to get contract package aliases"
    );
    return new Err(error);
  }
}

// ---------------------------------------------------------------------------
// Seat management
// ---------------------------------------------------------------------------

/**
 * Set the absolute quantity on a QUANTITY_ONLY subscription.
 * Always sets the total — safe against race conditions.
 */
export async function updateSubscriptionQuantity({
  metronomeCustomerId,
  contractId,
  subscriptionId,
  quantity,
  startingAt,
  uniquenessKey,
}: {
  metronomeCustomerId: string;
  contractId: string;
  subscriptionId: string;
  quantity: number;
  startingAt?: string;
  uniquenessKey?: string;
}): Promise<Result<void, Error>> {
  const now = startingAt ?? floorToHourISO(new Date());

  try {
    await getMetronomeClient().v2.contracts.edit({
      customer_id: metronomeCustomerId,
      contract_id: contractId,
      ...(uniquenessKey ? { uniqueness_key: uniquenessKey } : {}),
      update_subscriptions: [
        {
          subscription_id: subscriptionId,
          quantity_updates: [
            {
              starting_at: now,
              quantity,
            },
          ],
        },
      ],
    });

    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, contractId, subscriptionId },
      "[Metronome] Failed to update subscription quantity"
    );
    return new Err(error);
  }
}

// Response shape for POST /v1/contracts/getSubscriptionSeatsHistory. The
// Metronome Node SDK (3.5.0, latest) has no typed binding for this endpoint, so
// we route through the SDK client's generic post(), which still gives us auth +
// retries + error handling.
//
// `total_quantity` is the absolute billed seat count (assigned + unassigned) at
// the segment, returned as a STRING. The unassigned count is derived as
// `total_quantity - assigned_seat_ids.length` (see
// `getMetronomeSubscriptionSeatState`). NOTE: do not use the subscription's
// `quantity_schedule` or `retrieveSubscriptionQuantityHistory` for this — those
// report the base/proration quantity, not the seat-driven total.
interface SubscriptionSeatsHistoryResponse {
  data: Array<{
    starting_at: string;
    ending_before?: string | null;
    assigned_seat_ids: string[];
    total_quantity?: string;
  }>;
}

/**
 * The seat state of a SEAT_BASED subscription segment: the explicitly assigned
 * seat IDs plus the count of unassigned (paid-for but unallocated) seats.
 */
export type SubscriptionSeatState = {
  assignedSeatIds: string[];
  unassignedSeats: number;
};

/**
 * Fetch the seat state (assigned seat IDs + unassigned seat count) on a
 * SEAT_BASED subscription at `coveringDate` (defaults to now), via the (untyped)
 * getSubscriptionSeatsHistory endpoint.
 *
 * `unassignedSeats` is derived as `total_quantity - assignedCount` from the same
 * response — the endpoint returns the absolute billed total, but not the
 * unassigned count directly.
 */
export async function getMetronomeSubscriptionSeatState({
  metronomeCustomerId,
  contractId,
  subscriptionId,
  coveringDate,
}: {
  metronomeCustomerId: string;
  contractId: string;
  subscriptionId: string;
  // Defaults to `now`. Pass a future date to read the assignments projected
  // at that point in time.
  coveringDate?: Date;
}): Promise<Result<SubscriptionSeatState, Error>> {
  try {
    const response =
      await getMetronomeClient().post<SubscriptionSeatsHistoryResponse>(
        "/v1/contracts/getSubscriptionSeatsHistory",
        {
          body: {
            customer_id: metronomeCustomerId,
            contract_id: contractId,
            subscription_id: subscriptionId,
            covering_date: (coveringDate ?? new Date()).toISOString(),
          },
        }
      );
    // History is returned ascending by starting_at; take the last entry to
    // get the segment active at `coveringDate` (earlier entries are stale).
    const segment = response.data[response.data.length - 1];
    const assignedSeatIds = segment?.assigned_seat_ids ?? [];

    // `total_quantity` is a string (e.g. "998"). Fall back to the assigned
    // count (→ 0 unassigned) if it's missing/unparseable so we never invent a
    // floor top-up from a bad read.
    const totalQuantity = Number(segment?.total_quantity);
    const resolvedTotal = Number.isFinite(totalQuantity)
      ? totalQuantity
      : assignedSeatIds.length;

    return new Ok({
      assignedSeatIds,
      unassignedSeats: Math.max(0, resolvedTotal - assignedSeatIds.length),
    });
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, contractId, subscriptionId },
      "[Metronome] Failed to fetch subscription seats"
    );
    return new Err(error);
  }
}

/**
 * Fetch the assigned seat IDs on a SEAT_BASED subscription at `coveringDate`
 * (defaults to now), via the (untyped) getSubscriptionSeatsHistory endpoint.
 */
export async function getMetronomeSubscriptionAssignedSeatIds({
  metronomeCustomerId,
  contractId,
  subscriptionId,
  coveringDate,
}: {
  metronomeCustomerId: string;
  contractId: string;
  subscriptionId: string;
  // Defaults to `now`. Pass a future date to read the assignments projected
  // at that point in time.
  coveringDate?: Date;
}): Promise<Result<string[], Error>> {
  const stateResult = await getMetronomeSubscriptionSeatState({
    metronomeCustomerId,
    contractId,
    subscriptionId,
    coveringDate,
  });
  if (stateResult.isErr()) {
    return new Err(stateResult.error);
  }
  return new Ok(stateResult.value.assignedSeatIds);
}

/**
 * Add and/or remove specific seat IDs on one or two SEAT_BASED subscriptions
 * in a single contracts.edit call.
 *
 * When `toSubscriptionId` is omitted, all seat changes apply to
 * `fromSubscriptionId`. When `toSubscriptionId` is provided, `removeSeatIds`
 * are removed from `fromSubscriptionId` and `addSeatIds` are added to
 * `toSubscriptionId` — enabling atomic cross-subscription transitions.
 *
 * Unassigned seat counts must be passed explicitly:
 * - `addUnassignedSeats`: seats to add to `fromSubscriptionId` (annual
 *   unassignment — keeps quantity stable)
 * - `removeUnassignedSeats`: seats to remove from `fromSubscriptionId` (pool
 *   reconciliation — consuming a pre-purchased slot)
 */
export async function updateSubscriptionSeats({
  metronomeCustomerId,
  contractId,
  fromSubscriptionId,
  toSubscriptionId,
  addSeatIds = [],
  removeSeatIds = [],
  addUnassignedSeats = 0,
  removeUnassignedSeats = 0,
  startingAt,
}: {
  metronomeCustomerId: string;
  contractId: string;
  fromSubscriptionId: string;
  toSubscriptionId?: string;
  addSeatIds?: string[];
  removeSeatIds?: string[];
  addUnassignedSeats?: number;
  removeUnassignedSeats?: number;
  startingAt?: string;
}): Promise<Result<void, Error>> {
  const hasFromSeatIds = !toSubscriptionId && addSeatIds.length > 0;
  const isEmpty =
    removeSeatIds.length === 0 &&
    addUnassignedSeats === 0 &&
    removeUnassignedSeats === 0 &&
    !hasFromSeatIds &&
    !(toSubscriptionId && addSeatIds.length > 0);
  if (isEmpty) {
    return new Ok(undefined);
  }

  const scheduleTime = startingAt ?? floorToHourISO(new Date());

  const fromSeatUpdates = {
    ...(removeSeatIds.length > 0
      ? {
          remove_seat_ids: [
            { seat_ids: removeSeatIds, starting_at: scheduleTime },
          ],
        }
      : {}),
    ...(addUnassignedSeats > 0
      ? {
          add_unassigned_seats: [
            { quantity: addUnassignedSeats, starting_at: scheduleTime },
          ],
        }
      : {}),
    ...(removeUnassignedSeats > 0
      ? {
          remove_unassigned_seats: [
            { quantity: removeUnassignedSeats, starting_at: scheduleTime },
          ],
        }
      : {}),
    ...(hasFromSeatIds
      ? { add_seat_ids: [{ seat_ids: addSeatIds, starting_at: scheduleTime }] }
      : {}),
  };

  const updateSubscriptions = [
    ...(Object.keys(fromSeatUpdates).length > 0
      ? [{ subscription_id: fromSubscriptionId, seat_updates: fromSeatUpdates }]
      : []),
    ...(toSubscriptionId && addSeatIds.length > 0
      ? [
          {
            subscription_id: toSubscriptionId,
            seat_updates: {
              add_seat_ids: [
                { seat_ids: addSeatIds, starting_at: scheduleTime },
              ],
            },
          },
        ]
      : []),
  ];

  if (updateSubscriptions.length === 0) {
    return new Ok(undefined);
  }

  try {
    await getMetronomeClient().v2.contracts.edit({
      customer_id: metronomeCustomerId,
      contract_id: contractId,
      update_subscriptions: updateSubscriptions,
    });
    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      {
        error,
        metronomeCustomerId,
        contractId,
        fromSubscriptionId,
        toSubscriptionId,
      },
      "[Metronome] Failed to update subscription seats"
    );
    return new Err(error);
  }
}

// ---------------------------------------------------------------------------
// Commits
// ---------------------------------------------------------------------------

/**
 * Add paid credits (=commits) to a Metronome customer.
 *
 * When `invoiceSchedule` is provided, Metronome also raises the matching
 * invoice for the commit (pushed to Stripe through the integration).
 * `unitPrice` must be in Metronome's fiat unit for the invoice credit type
 * (cents for USD, whole units for other currencies — see `metronomeAmount`).
 * `contractId` is required by Metronome whenever an `invoice_schedule` is
 * set on a customer-level commit — it tells Metronome which contract
 * should host the invoice line.
 */
export async function createMetronomeCommit({
  metronomeCustomerId,
  productId,
  creditTypeId,
  amount,
  startingAt,
  endingBefore,
  name,
  idempotencyKey,
  priority,
  invoiceSchedule,
  customFields,
}: {
  metronomeCustomerId: string;
  productId: string;
  creditTypeId: string;
  amount: number;
  startingAt: Date;
  endingBefore: Date;
  idempotencyKey: string;
  name?: string;
  priority?: number;
  invoiceSchedule?: {
    contractId: string;
    creditTypeId: string;
    unitPrice: number;
    quantity: number;
    timestamp: Date;
  };
  customFields?: Record<string, string>;
}): Promise<Result<{ id: string } | null, Error>> {
  // Metronome requires dates on hour boundaries — round down start, round up end.
  const roundedStartingAt = floorToHourISO(startingAt);
  const roundedEndingBefore = floorToHourISO(endingBefore);
  try {
    logger.info(
      {
        metronomeCustomerId,
        productId,
        creditTypeId,
        amount,
        roundedStartingAt,
        roundedEndingBefore,
        hasInvoiceSchedule: invoiceSchedule !== undefined,
      },
      "[Metronome] Adding commits to customer"
    );

    const response = await getMetronomeClient().v1.customers.commits.create({
      customer_id: metronomeCustomerId,
      type: "PREPAID",
      product_id: productId,
      name: name ?? "Commit purchase",
      applicable_product_tags: ["usage"],
      priority: priority ?? 2, // Apply after any free credits
      access_schedule: {
        credit_type_id: creditTypeId,
        schedule_items: [
          {
            amount,
            starting_at: roundedStartingAt,
            ending_before: roundedEndingBefore,
          },
        ],
      },
      ...(invoiceSchedule
        ? {
            invoice_contract_id: invoiceSchedule.contractId,
            invoice_schedule: {
              credit_type_id: invoiceSchedule.creditTypeId,
              schedule_items: [
                {
                  unit_price: invoiceSchedule.unitPrice,
                  quantity: invoiceSchedule.quantity,
                  timestamp: floorToHourISO(invoiceSchedule.timestamp),
                },
              ],
            },
          }
        : {}),
      ...(customFields && Object.keys(customFields).length > 0
        ? { custom_fields: customFields }
        : {}),
      uniqueness_key: idempotencyKey,
    });

    logger.info(
      {
        metronomeCustomerId,
        productId,
        amount,
        roundedStartingAt,
        roundedEndingBefore,
      },
      "[Metronome] Commits added to customer"
    );
    return new Ok(response.data);
  } catch (err) {
    if (err instanceof ConflictError) {
      // Idempotency key conflict — commit already created, look it up by
      // uniqueness_key so the caller can persist the existing id.
      const existing = await findMetronomeCommitByUniquenessKey({
        metronomeCustomerId,
        uniquenessKey: idempotencyKey,
        coveringDate: roundedStartingAt,
      });
      if (existing.isOk() && existing.value) {
        logger.info(
          {
            metronomeCustomerId,
            idempotencyKey,
            metronomeCommitId: existing.value.id,
          },
          "[Metronome] Commit already exists (idempotent), reusing id"
        );
        return new Ok({ id: existing.value.id });
      }
      logger.info(
        { metronomeCustomerId, idempotencyKey },
        "[Metronome] Commit already exists (idempotent) but lookup did not find it"
      );
      return new Ok(null);
    }

    const error = normalizeError(err);
    logger.error(
      {
        error,
        metronomeCustomerId,
        productId,
        amount,
        roundedStartingAt,
        roundedEndingBefore,
      },
      "[Metronome] Failed to add commits to customer"
    );
    return new Err(error);
  }
}

/**
 * Add a Stripe payment-gated PREPAID commit to an existing contract via
 * `v2.contracts.edit`. Metronome will create the commit, generate the
 * invoice, push it to Stripe, and unlock the commit once payment is
 * collected (no manual grant needed on our side).
 *
 * `invoiceUnitPrice` is the per-credit fiat price in the invoice credit
 * type's units — cents for USD, whole units for other fiat currencies
 * (matches Metronome's fiat unit convention; see `metronomeAmount`).
 * `invoiceQuantity` is the number of credits being invoiced. Passing
 * unit_price + quantity (instead of a flat `amount`) lets Metronome
 * construct Stripe `price_data` on push and auto-provision the Stripe
 * Product for FIXED Metronome products that have never been invoiced
 * via Stripe before.
 *
 * `tax_type` is intentionally omitted: each Metronome product carries a
 * default tax category that Stripe uses, and overriding it from here
 * would force Metronome to resolve a per-line Stripe Product mapping it
 * doesn't have.
 */
export async function addPaymentGatedCommitToContract({
  metronomeCustomerId,
  metronomeContractId,
  productId,
  accessAmount,
  accessCreditTypeId,
  accessStartingAt,
  accessEndingBefore,
  invoiceUnitPrice,
  invoiceQuantity,
  invoiceCreditTypeId,
  invoiceTimestamp,
  priority,
  name,
  uniquenessKey,
  stripeInvoiceMetadata,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
  productId: string;
  accessAmount: number;
  accessCreditTypeId: string;
  accessStartingAt: Date;
  accessEndingBefore: Date;
  invoiceUnitPrice: number;
  invoiceQuantity: number;
  invoiceCreditTypeId: string;
  invoiceTimestamp: Date;
  priority: number;
  name: string;
  uniquenessKey: string;
  stripeInvoiceMetadata: Record<string, string>;
}): Promise<Result<{ editId: string }, Error>> {
  try {
    const response = await getMetronomeClient().v2.contracts.edit({
      customer_id: metronomeCustomerId,
      contract_id: metronomeContractId,
      uniqueness_key: uniquenessKey,
      add_commits: [
        {
          product_id: productId,
          type: "PREPAID",
          name,
          priority,
          applicable_product_tags: ["usage"],
          access_schedule: {
            credit_type_id: accessCreditTypeId,
            schedule_items: [
              {
                amount: accessAmount,
                starting_at: floorToHourISO(accessStartingAt),
                ending_before: floorToHourISO(accessEndingBefore),
              },
            ],
          },
          invoice_schedule: {
            credit_type_id: invoiceCreditTypeId,
            schedule_items: [
              {
                unit_price: invoiceUnitPrice,
                quantity: invoiceQuantity,
                timestamp: floorToHourISO(invoiceTimestamp),
              },
            ],
          },
          payment_gate_config: {
            payment_gate_type: "STRIPE",
            tax_type: "STRIPE",
            stripe_config: {
              payment_type: "INVOICE",
              invoice_metadata: stripeInvoiceMetadata,
            },
          },
        },
      ],
    });

    logger.info(
      {
        metronomeCustomerId,
        metronomeContractId,
        editId: response.data.id,
        accessAmount,
        invoiceUnitPrice,
        invoiceQuantity,
      },
      "[Metronome] Payment-gated commit added to contract"
    );

    return new Ok({ editId: response.data.id });
  } catch (err) {
    if (err instanceof ConflictError) {
      logger.info(
        { metronomeCustomerId, metronomeContractId, uniquenessKey },
        "[Metronome] Payment-gated commit edit already exists (idempotent)"
      );
      return new Ok({ editId: "" });
    }

    const error = normalizeError(err);
    logger.error(
      {
        error,
        metronomeCustomerId,
        metronomeContractId,
        accessAmount,
        invoiceUnitPrice,
        invoiceQuantity,
      },
      "[Metronome] Failed to add payment-gated commit to contract"
    );
    return new Err(error);
  }
}

/**
 * Add a plain (non-payment-gated) PREPAID commit to an existing contract via
 * `v2.contracts.edit`. Unlike `addPaymentGatedCommitToContract`, the credits
 * are available immediately (no Stripe payment gate); Metronome raises the
 * invoice through the contract's billing configuration on its normal cadence,
 * and collection follows the customer's Stripe collection method.
 *
 * `invoiceUnitPrice` is the per-unit fiat price in the invoice credit type's
 * units — cents for USD, whole units for other fiat currencies (matches
 * Metronome's fiat unit convention; see `metronomeAmount`). Passing
 * `invoiceQuantity: 1` makes `invoiceUnitPrice` the full invoice total.
 */
export async function addPrepaidCommitToContract({
  metronomeCustomerId,
  metronomeContractId,
  productId,
  accessAmount,
  accessCreditTypeId,
  accessStartingAt,
  accessEndingBefore,
  invoiceUnitPrice,
  invoiceQuantity,
  invoiceCreditTypeId,
  invoiceTimestamp,
  priority,
  name,
  uniquenessKey,
  applicableProductIds,
  applicableProductTags,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
  productId: string;
  accessAmount: number;
  accessCreditTypeId: string;
  accessStartingAt: Date;
  accessEndingBefore: Date;
  invoiceUnitPrice: number;
  invoiceQuantity: number;
  invoiceCreditTypeId: string;
  invoiceTimestamp: Date;
  priority: number;
  name: string;
  uniquenessKey: string;
  applicableProductIds?: string[];
  applicableProductTags?: string[];
}): Promise<Result<{ editId: string }, Error>> {
  try {
    const response = await getMetronomeClient().v2.contracts.edit({
      customer_id: metronomeCustomerId,
      contract_id: metronomeContractId,
      uniqueness_key: uniquenessKey,
      add_commits: [
        {
          product_id: productId,
          type: "PREPAID",
          name,
          priority,
          ...(applicableProductIds && applicableProductIds.length > 0
            ? { applicable_product_ids: applicableProductIds }
            : {}),
          ...(applicableProductTags && applicableProductTags.length > 0
            ? { applicable_product_tags: applicableProductTags }
            : {}),
          access_schedule: {
            credit_type_id: accessCreditTypeId,
            schedule_items: [
              {
                amount: accessAmount,
                starting_at: floorToHourISO(accessStartingAt),
                ending_before: floorToHourISO(accessEndingBefore),
              },
            ],
          },
          invoice_schedule: {
            credit_type_id: invoiceCreditTypeId,
            schedule_items: [
              {
                unit_price: invoiceUnitPrice,
                quantity: invoiceQuantity,
                timestamp: floorToHourISO(invoiceTimestamp),
              },
            ],
          },
        },
      ],
    });

    logger.info(
      {
        metronomeCustomerId,
        metronomeContractId,
        editId: response.data.id,
        accessAmount,
        invoiceUnitPrice,
        invoiceQuantity,
      },
      "[Metronome] Prepaid commit added to contract"
    );

    return new Ok({ editId: response.data.id });
  } catch (err) {
    if (err instanceof ConflictError) {
      logger.info(
        { metronomeCustomerId, metronomeContractId, uniquenessKey },
        "[Metronome] Prepaid commit edit already exists (idempotent)"
      );
      return new Ok({ editId: "" });
    }

    const error = normalizeError(err);
    logger.error(
      {
        error,
        metronomeCustomerId,
        metronomeContractId,
        accessAmount,
        invoiceUnitPrice,
        invoiceQuantity,
      },
      "[Metronome] Failed to add prepaid commit to contract"
    );
    return new Err(error);
  }
}

/**
 * Find a customer-level commit by its uniqueness_key.
 * Used to recover the id after a 409 conflict on creation.
 * Scoped via covering_date so we don't paginate through expired commits.
 */
export async function findMetronomeCommitByUniquenessKey({
  metronomeCustomerId,
  uniquenessKey,
  coveringDate,
}: {
  metronomeCustomerId: string;
  uniquenessKey: string;
  coveringDate: string;
}): Promise<Result<{ id: string } | null, Error>> {
  const result = await listMetronomeCustomerCommits({
    metronomeCustomerId,
    coveringDate,
  });
  if (result.isErr()) {
    return result;
  }
  const match = result.value.find((c) => c.uniqueness_key === uniquenessKey);
  return new Ok(match ? { id: match.id } : null);
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/**
 * List all products from Metronome. Returns the raw SDK product objects so
 * callers can read whatever fields they need (custom_fields, current state,
 * etc.) without us maintaining a stripped wrapper type.
 */
export async function listMetronomeProducts(): Promise<
  Result<ProductListResponse[], Error>
> {
  try {
    const products: ProductListResponse[] = [];
    for await (const product of getMetronomeClient().v1.contracts.products.list()) {
      products.push(product);
    }
    return new Ok(products);
  } catch (err) {
    const error = normalizeError(err);
    logger.error({ error }, "[Metronome] Failed to list products");
    return new Err(error);
  }
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

/**
 * List draft invoices for a Metronome customer.
 * Draft invoices reflect up-to-date spend for the current billing period
 * before final billing. Used to compute estimated current-period billing.
 */
export async function listMetronomeDraftInvoices(
  metronomeCustomerId: string
): Promise<Result<Invoice[], Error>> {
  try {
    const invoices: Invoice[] = [];
    for await (const entry of getMetronomeClient().v1.customers.invoices.list({
      customer_id: metronomeCustomerId,
      status: "DRAFT",
      skip_zero_qty_line_items: true,
    })) {
      invoices.push(entry);
    }
    return new Ok(invoices);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId },
      "[Metronome] Failed to list draft invoices"
    );
    return new Err(error);
  }
}

export async function listMetronomeBalances(
  metronomeCustomerId: string,
  {
    includeArchived = false,
    coveringDate = new Date(),
    effectiveBefore,
    onlyPoolCredits = true,
  }: {
    // Pass `null` to drop the `covering_date` filter and return balances of any
    // date (including expired and, depending on `effectiveBefore`, future ones).
    coveringDate?: Date | null;
    // Restrict to balances with any access before this date — used to hide
    // future-dated balances while still returning expired ones.
    effectiveBefore?: Date;
    includeArchived?: boolean;
    // Restrict to balances related to pool credits
    onlyPoolCredits?: boolean;
  } = {}
): Promise<Result<MetronomeBalance[], Error>> {
  if (!config.getMetronomeApiKey()) {
    return new Ok([]);
  }

  const client = getMetronomeClient();

  try {
    const balances: MetronomeBalance[] = [];
    for await (const entry of client.v1.contracts.listBalances({
      customer_id: metronomeCustomerId,
      include_balance: true,
      include_contract_balances: true,
      ...(coveringDate !== null
        ? { covering_date: coveringDate.toISOString() }
        : {}),
      ...(effectiveBefore !== undefined
        ? { effective_before: effectiveBefore.toISOString() }
        : {}),
      ...(includeArchived ? { include_archived: true } : {}),
    })) {
      // Mirror the default ContractCredit alert filter: include only
      // credits explicitly tagged DUST_CONTRACT_CREDIT_TYPE=pool. Excess
      // credits (tagged "excess") and per-seat / unstamped credits are
      // excluded — they're not part of the workspace pool balance the
      // alert tracks. Commits are not stamped and pass through unchanged.
      if (
        onlyPoolCredits &&
        entry.type === "CREDIT" &&
        entry.custom_fields?.[CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY] !==
          CONTRACT_CREDIT_TYPE_POOL
      ) {
        continue;
      }
      balances.push(entry);
    }
    return new Ok(balances);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId },
      "[Metronome] Failed to list balances"
    );
    return new Err(error);
  }
}

type WindowSize = "HOUR" | "DAY" | "NONE";

export async function listMetronomeUsage({
  customerIds,
  billableMetricIds,
  startingOn,
  endingBefore,
  windowSize,
}: {
  customerIds: string[];
  billableMetricIds?: string[];
  startingOn: string;
  endingBefore: string;
  windowSize: WindowSize;
}): Promise<Result<MetronomeUsageListResponse[], Error>> {
  if (!config.getMetronomeApiKey()) {
    return new Ok([]);
  }

  const client = getMetronomeClient();

  try {
    const results: MetronomeUsageListResponse[] = [];
    for await (const entry of client.v1.usage.list({
      starting_on: startingOn,
      ending_before: endingBefore,
      window_size: windowSize,
      customer_ids: customerIds,
      ...(billableMetricIds
        ? { billable_metrics: billableMetricIds.map((id) => ({ id })) }
        : {}),
    })) {
      results.push({
        billableMetricId: entry.billable_metric_id,
        billableMetricName: entry.billable_metric_name,
        customerId: entry.customer_id,
        startTimestamp: entry.start_timestamp,
        endTimestamp: entry.end_timestamp,
        value: entry.value,
      });
    }
    return new Ok(results);
  } catch (err) {
    const error = normalizeError(err);
    logger.error({ error }, "[Metronome] Failed to list usage");
    return new Err(error);
  }
}

export async function listMetronomeUsageWithGroups({
  customerId,
  billableMetricId,
  startingOn,
  endingBefore,
  windowSize,
  groupKey,
  groupFilters,
}: {
  customerId: string;
  billableMetricId: string;
  // Must be UTC midnight (Metronome requirement). To restrict to an
  // hour-precise period, query midnight-aligned bounds with an HOUR window and
  // trim the returned buckets to the exact range. (The API's `current_period`
  // flag is not an option: it requires a legacy v1 Plan, which our
  // contract-based customers don't have.)
  startingOn: string;
  endingBefore: string;
  windowSize: WindowSize;
  groupKey: string[];
  // Restrict returned groups to these values per group key. Keys must be part
  // of `groupKey`; an omitted key returns all of its values.
  groupFilters?: Record<string, string[]>;
}): Promise<Result<MetronomeUsageWithGroupsResponse[], Error>> {
  if (!config.getMetronomeApiKey()) {
    return new Ok([]);
  }

  const client = getMetronomeClient();

  try {
    const results: MetronomeUsageWithGroupsResponse[] = [];
    for await (const entry of client.v1.usage.listWithGroups({
      customer_id: customerId,
      billable_metric_id: billableMetricId,
      window_size: windowSize,
      group_key: groupKey,
      starting_on: startingOn,
      ending_before: endingBefore,
      ...(groupFilters ? { group_filters: groupFilters } : {}),
    })) {
      results.push({
        startingOn: entry.starting_on,
        endingBefore: entry.ending_before,
        value: entry.value,
        group: entry.group ?? null,
      });
    }
    return new Ok(results);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, customerId, billableMetricId },
      "[Metronome] Failed to list usage with groups"
    );
    return new Err(error);
  }
}

/**
 * Update the amount of a credit segment created from a recurring credit in a package.
 * Called when a credit.segment.start webhook fires, to set the correct user-based amount.
 * The segment_id is the access schedule item ID provided in the webhook event.
 */
export async function updateMetronomeCreditSegmentAmount({
  metronomeCustomerId,
  contractId,
  creditId,
  segmentId,
  amount,
}: {
  metronomeCustomerId: string;
  contractId: string;
  creditId: string;
  segmentId: string;
  amount: number;
}): Promise<Result<{ id: string }, Error>> {
  try {
    await getMetronomeClient().v2.contracts.edit({
      customer_id: metronomeCustomerId,
      contract_id: contractId,
      update_credits: [
        {
          credit_id: creditId,
          access_schedule: {
            update_schedule_items: [
              {
                id: segmentId,
                amount,
              },
            ],
          },
        },
      ],
    });

    logger.info(
      { metronomeCustomerId, contractId, creditId, segmentId, amount },
      "[Metronome] Free credit segment amount updated"
    );
    return new Ok({ id: creditId });
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, contractId, creditId, segmentId, amount },
      "[Metronome] Failed to update free credit segment amount"
    );
    return new Err(error);
  }
}

/**
 * Create a credit grant on a Metronome customer.
 * Used for monthly free programmatic credits on legacy plans.
 */
export async function createMetronomeCredit({
  metronomeCustomerId,
  productId,
  creditTypeId,
  amount,
  startingAt,
  endingBefore,
  name,
  idempotencyKey,
  applicableProductTags,
  applicableProductIds,
  priority,
}: {
  metronomeCustomerId: string;
  productId: string;
  creditTypeId: string;
  amount: number;
  startingAt: string;
  endingBefore: string;
  name: string;
  idempotencyKey: string;
  applicableProductTags?: string[];
  applicableProductIds?: string[];
  priority: number;
}): Promise<Result<{ id: string } | null, Error>> {
  // Metronome requires dates on hour boundaries — round down start, round up end.
  const roundedStartingAt = floorToHourISO(new Date(startingAt));
  const roundedEndingBefore = floorToHourISO(new Date(endingBefore));

  try {
    const response = await getMetronomeClient().v1.customers.credits.create({
      customer_id: metronomeCustomerId,
      product_id: productId,
      name,
      priority,
      ...(applicableProductTags
        ? { applicable_product_tags: applicableProductTags }
        : {}),
      ...(applicableProductIds
        ? { applicable_product_ids: applicableProductIds }
        : {}),
      access_schedule: {
        credit_type_id: creditTypeId,
        schedule_items: [
          {
            amount,
            starting_at: roundedStartingAt,
            ending_before: roundedEndingBefore,
          },
        ],
      },
      uniqueness_key: idempotencyKey,
    });

    return new Ok(response.data);
  } catch (err) {
    if (err instanceof ConflictError) {
      // Idempotency key conflict — credit already granted, look it up by
      // uniqueness_key so the caller can persist the existing id.
      const existing = await findMetronomeCreditByUniquenessKey({
        metronomeCustomerId,
        uniquenessKey: idempotencyKey,
        coveringDate: roundedStartingAt,
      });
      if (existing.isOk() && existing.value) {
        logger.info(
          {
            metronomeCustomerId,
            idempotencyKey,
            metronomeCreditId: existing.value.id,
          },
          "[Metronome] Credit grant already exists (idempotent), reusing id"
        );
        return new Ok({ id: existing.value.id });
      }
      logger.info(
        { metronomeCustomerId, idempotencyKey },
        "[Metronome] Credit grant already exists (idempotent) but lookup did not find it"
      );
      return new Ok(null);
    }

    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, name, idempotencyKey },
      "[Metronome] Failed to create credit grant"
    );
    return new Err(error);
  }
}

/**
 * Find a customer-level credit by its uniqueness_key.
 * Used to recover the id after a 409 conflict on creation.
 * Scoped via covering_date so we don't paginate through expired credits.
 */
export async function findMetronomeCreditByUniquenessKey({
  metronomeCustomerId,
  uniquenessKey,
  coveringDate,
}: {
  metronomeCustomerId: string;
  uniquenessKey: string;
  coveringDate: string;
}): Promise<Result<{ id: string } | null, Error>> {
  const result = await listMetronomeCustomerCredits({
    metronomeCustomerId,
    coveringDate,
  });
  if (result.isErr()) {
    return result;
  }
  const match = result.value.find((c) => c.uniqueness_key === uniquenessKey);
  return new Ok(match ? { id: match.id } : null);
}

/**
 * List customer-level credits for a Metronome customer.
 * Optionally filter by a specific credit id.
 */
export async function listMetronomeCustomerCredits({
  metronomeCustomerId,
  creditId,
  includeContractCredits = false,
  includeBalance = false,
  coveringDate,
}: {
  metronomeCustomerId: string;
  creditId?: string;
  includeContractCredits?: boolean;
  includeBalance?: boolean;
  coveringDate?: string;
}): Promise<Result<Credit[], Error>> {
  try {
    const page = await getMetronomeClient().v1.customers.credits.list({
      customer_id: metronomeCustomerId,
      ...(creditId ? { credit_id: creditId } : {}),
      ...(coveringDate ? { covering_date: coveringDate } : {}),
      include_contract_credits: includeContractCredits,
      include_balance: includeBalance,
    });
    return new Ok(page.data);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, creditId },
      "[Metronome] Failed to list customer credits"
    );
    return new Err(error);
  }
}

/**
 * List customer-level commits for a Metronome customer.
 * Optionally filter by a specific commit id.
 */
export async function listMetronomeCustomerCommits({
  metronomeCustomerId,
  commitId,
  includeContractCommits = false,
  includeBalance = false,
  coveringDate,
}: {
  metronomeCustomerId: string;
  commitId?: string;
  includeContractCommits?: boolean;
  includeBalance?: boolean;
  coveringDate?: string;
}): Promise<Result<Commit[], Error>> {
  try {
    const page = await getMetronomeClient().v1.customers.commits.list({
      customer_id: metronomeCustomerId,
      ...(commitId ? { commit_id: commitId } : {}),
      ...(coveringDate ? { covering_date: coveringDate } : {}),
      include_contract_commits: includeContractCommits,
      include_balance: includeBalance,
    });
    return new Ok(page.data);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, commitId },
      "[Metronome] Failed to list customer commits"
    );
    return new Err(error);
  }
}

/**
 * Fetch a specific customer-level credit by its Metronome ID.
 */
export async function getMetronomeCredit({
  metronomeCustomerId,
  creditId,
  includeContractCredits = true,
  includeBalance = false,
}: {
  metronomeCustomerId: string;
  creditId: string;
  includeContractCredits?: boolean;
  includeBalance?: boolean;
}): Promise<Result<Credit | null, Error>> {
  const result = await listMetronomeCustomerCredits({
    metronomeCustomerId,
    creditId,
    includeContractCredits,
    includeBalance,
  });
  if (result.isErr()) {
    return result;
  }
  return new Ok(result.value[0] ?? null);
}

/**
 * Fetch a specific customer-level commit by its Metronome ID.
 */
export async function getMetronomeCommit({
  metronomeCustomerId,
  commitId,
  includeContractCommits = true,
  includeBalance = false,
}: {
  metronomeCustomerId: string;
  commitId: string;
  includeContractCommits?: boolean;
  includeBalance?: boolean;
}): Promise<Result<Commit | null, Error>> {
  const result = await listMetronomeCustomerCommits({
    metronomeCustomerId,
    commitId,
    includeContractCommits,
    includeBalance,
  });
  if (result.isErr()) {
    return result;
  }
  return new Ok(result.value[0] ?? null);
}

/**
 * Update the access end date on a customer-level credit.
 * Used when revoking a coupon to cut off the credit early.
 */
export async function updateMetronomeCreditEndDate({
  metronomeCustomerId,
  creditId,
  accessEndingBefore,
}: {
  metronomeCustomerId: string;
  creditId: string;
  accessEndingBefore: string;
}): Promise<Result<void, Error>> {
  try {
    await getMetronomeClient().v1.customers.credits.updateEndDate({
      customer_id: metronomeCustomerId,
      credit_id: creditId,
      access_ending_before: accessEndingBefore,
    });
    logger.info(
      { metronomeCustomerId, creditId, accessEndingBefore },
      "[Metronome] Credit end date updated"
    );
    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, creditId, accessEndingBefore },
      "[Metronome] Failed to update credit end date"
    );
    return new Err(error);
  }
}

/**
 * Apply a manual deduction to a customer-level credit balance.
 * Used when backfilling credits that have a pre-existing consumed amount.
 * The amount parameter is a positive value and will be negated internally.
 */
export async function deductMetronomeCreditBalance({
  metronomeCustomerId,
  contractId,
  creditId,
  segmentId,
  amount,
  reason,
}: {
  metronomeCustomerId: string;
  // Pass `contractId` for contract-level credits / commits. Customer-level
  // entries (e.g., one-off poke credits) leave it undefined.
  contractId?: string;
  creditId: string;
  segmentId: string;
  amount: number;
  reason: string;
}): Promise<Result<void, Error>> {
  try {
    await getMetronomeClient().v1.contracts.addManualBalanceEntry({
      id: creditId,
      customer_id: metronomeCustomerId,
      amount: -amount, // negative to draw down the balance
      reason,
      segment_id: segmentId,
      ...(contractId ? { contract_id: contractId } : {}),
    });
    logger.info(
      { metronomeCustomerId, contractId, creditId, segmentId, amount },
      "[Metronome] Manual credit deduction applied"
    );
    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, contractId, creditId, segmentId, amount },
      "[Metronome] Failed to apply manual credit deduction"
    );
    return new Err(error);
  }
}

/**
 * List per-seat balances for a SEAT_BASED contract.
 * Uses a raw fetch because the Metronome SDK does not yet expose this endpoint.
 * Returns one entry per seat_id (user sId), with balance (remaining) and
 * starting_balance (full allocation for the period).
 */
export async function listMetronomeSeatBalances({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
}): Promise<Result<MetronomeSeatBalance[], Error>> {
  if (!config.getMetronomeApiKey()) {
    return new Ok([]);
  }

  try {
    const response = await getMetronomeClient().post<{ data?: unknown[] }>(
      "/v1/contracts/seatBalances/list",
      {
        body: {
          customer_id: metronomeCustomerId,
          contract_id: metronomeContractId,
          include_credits_and_commits: true,
          covering_date: new Date().toISOString(),
        },
      }
    );
    const balances = (response.data ?? []).filter(isMetronomeSeatBalance);
    return new Ok(balances);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, metronomeContractId },
      "[Metronome] Failed to list seat balances"
    );
    return new Err(error);
  }
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export async function createMetronomeAlert(
  params: V1.AlertCreateParams
): Promise<V1.AlertCreateResponse> {
  return getMetronomeClient().v1.alerts.create(params);
}

// Archives the alert and releases its uniqueness_key so it can be reused
// by a subsequent create (the only way we ever archive alerts today).
export async function archiveMetronomeAlert(
  params: V1.AlertArchiveParams
): Promise<V1.AlertArchiveResponse> {
  return getMetronomeClient().v1.alerts.archive({
    ...params,
    release_uniqueness_key: true,
  });
}

// Lazily iterates Metronome customer alerts, transparently auto-paginating via
// the SDK's PagePromise. Callers can `break` to early-exit (no extra pages are
// fetched) or iterate to the end to scan everything. Errors thrown by the SDK
// surface through the iterator — callers wrap with try/catch + `Result`.
export async function* listMetronomeAlerts(
  params: V1.Customers.AlertListParams
): AsyncGenerator<CustomerAlert> {
  for await (const entry of getMetronomeClient().v1.customers.alerts.list(
    params
  )) {
    yield entry;
  }
}
