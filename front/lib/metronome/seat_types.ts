import { getMetronomeClient } from "@app/lib/metronome/client";
import {
  DEFAULT_SEAT_TYPE_CUSTOM_FIELD_KEY,
  SEAT_TYPE_CUSTOM_FIELD_KEY,
} from "@app/lib/metronome/constants";
import type { CachedContract } from "@app/lib/metronome/plan_type";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";
import { isMembershipSeatType } from "@app/types/memberships";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Subscription } from "@metronome/sdk/resources";

/**
 * Fetch all Metronome products and build a `productId → seatType` map from
 * the `DUST_SEAT_TYPE` custom field stamped on each product by the setup
 * script.
 *
 * Products are global per-environment (not workspace-scoped) and rarely
 * change, so the response is cached in Redis for 6h.
 */
async function fetchProductSeatTypes(): Promise<
  Record<string, MembershipSeatType>
> {
  const result: Record<string, MembershipSeatType> = {};
  try {
    for await (const product of getMetronomeClient().v1.contracts.products.list()) {
      const value = product.custom_fields?.[SEAT_TYPE_CUSTOM_FIELD_KEY];
      if (value && isMembershipSeatType(value)) {
        result[product.id] = value;
      }
    }
  } catch (err) {
    logger.warn(
      { err: normalizeError(err) },
      "[Metronome] Failed to fetch product seat types — returning empty map"
    );
  }
  return result;
}

const PRODUCT_SEAT_TYPES_CACHE_KEY = "metronome:product-seat-types";
const PRODUCT_SEAT_TYPES_TTL_MS = 6 * 60 * 60 * 1000;

const getCachedProductSeatTypes = cacheWithRedis(
  fetchProductSeatTypes,
  () => PRODUCT_SEAT_TYPES_CACHE_KEY,
  { ttlMs: PRODUCT_SEAT_TYPES_TTL_MS }
);

/**
 * Returns the `productId → seatType` map for all Metronome products tagged
 * with `DUST_SEAT_TYPE`. Cached in Redis. Call once per request (or job)
 * and pass the map to the sync helpers below.
 */
export async function getProductSeatTypes(): Promise<
  Map<string, MembershipSeatType>
> {
  return new Map(Object.entries(await getCachedProductSeatTypes()));
}

/**
 * Invalidate the cached product seat-type map. Call this after the setup
 * script updates product custom_fields.
 */
export const invalidateProductSeatTypesCache = invalidateCacheWithRedis(
  fetchProductSeatTypes,
  () => PRODUCT_SEAT_TYPES_CACHE_KEY
);

/**
 * Resolve the seat type for a subscription by looking up its product in the
 * cached `productSeatTypes` map. Returns `undefined` when the product isn't
 * tagged with `DUST_SEAT_TYPE` — untagged subscriptions are not seats and
 * are ignored by seat-handling code paths.
 *
 * Product names and IDs are intentionally *not* compared: products are
 * re-created on every Metronome setup run with fresh IDs, and names drift
 * over time. The custom field on the product is the only stable identifier.
 */
export function getSeatTypeForSubscription(
  sub: Pick<Subscription, "subscription_rate">,
  productSeatTypes: Map<string, MembershipSeatType>
): MembershipSeatType | undefined {
  return productSeatTypes.get(sub.subscription_rate.product.id);
}

/**
 * Contracts are exclusively either MAU-billed or seat-billed. MAU contracts
 * carry the `MAU_THRESHOLD` contract custom field (set by the operator at
 * contract creation); seat contracts never have it. Use this gate before any
 * seat-related work on a contract.
 */
export function isMauContract(
  contract: Pick<CachedContract, "custom_fields">
): boolean {
  return Boolean(contract.custom_fields?.MAU_THRESHOLD);
}

/**
 * Fetch the `DUST_DEFAULT_SEAT_TYPE` value from a rate card. The rate card
 * is the template-level entity shared by all contracts on the same plan,
 * so tagging it once at `metronome_setup` time backfills every existing
 * and future contract — no per-contract setValues needed.
 */
async function fetchRateCardDefaultSeatType(
  rateCardId: string
): Promise<MembershipSeatType | null> {
  try {
    const response = await getMetronomeClient().v1.contracts.rateCards.retrieve(
      { id: rateCardId }
    );
    const value =
      response.data.custom_fields?.[DEFAULT_SEAT_TYPE_CUSTOM_FIELD_KEY];
    return value && isMembershipSeatType(value) ? value : null;
  } catch (err) {
    logger.warn(
      { rateCardId, err: normalizeError(err) },
      "[Metronome] Failed to fetch rate card default seat type"
    );
    return null;
  }
}

const RATE_CARD_DEFAULT_SEAT_TYPE_TTL_MS = 6 * 60 * 60 * 1000;

const getCachedRateCardDefaultSeatType = cacheWithRedis(
  fetchRateCardDefaultSeatType,
  (rateCardId: string) => `metronome:rate-card-default-seat-type:${rateCardId}`,
  { ttlMs: RATE_CARD_DEFAULT_SEAT_TYPE_TTL_MS }
);

/**
 * Returns the seat type to assign to a new membership on this contract,
 * resolved from the rate card's `DUST_DEFAULT_SEAT_TYPE` custom field.
 * Validated against the seat tiers actually billed on the contract.
 * Returns `undefined` when the rate card is missing the field, holds an
 * unrecognised value, or points to a seat type the contract doesn't carry
 * — the caller should refuse to create the membership in those cases
 * rather than silently fall back to a hardcoded seat type.
 */
export async function getDefaultSeatTypeForContract(
  contract: Pick<CachedContract, "subscriptions" | "rate_card_id">,
  productSeatTypes: Map<string, MembershipSeatType>
): Promise<MembershipSeatType | undefined> {
  if (!contract.rate_card_id) {
    return undefined;
  }
  const seatTypesOnContract = new Set(
    getSeatSubscriptionsFromContract(contract, productSeatTypes).keys()
  );
  if (seatTypesOnContract.size === 0) {
    return undefined;
  }
  const value = await getCachedRateCardDefaultSeatType(contract.rate_card_id);
  if (!value) {
    return undefined;
  }
  return seatTypesOnContract.has(value) ? value : undefined;
}

/**
 * Walk a contract's subscriptions and build a `seatType → subscription`
 * index using the cached product seat-type map.
 */
export function getSeatSubscriptionsFromContract(
  contract: Pick<CachedContract, "subscriptions">,
  productSeatTypes: Map<string, MembershipSeatType>
): Map<MembershipSeatType, Subscription> {
  const result = new Map<MembershipSeatType, Subscription>();
  for (const sub of contract.subscriptions ?? []) {
    const seatType = getSeatTypeForSubscription(sub, productSeatTypes);
    if (seatType) {
      result.set(seatType, sub);
    }
  }
  return result;
}

/**
 * Build a `productId → seatType` map restricted to the products referenced
 * by the contract's subscriptions. Use when iterating a rate-card schedule
 * that exposes only product IDs.
 */
export function getSeatTypesByProductIdFromContract(
  contract: Pick<CachedContract, "subscriptions">,
  productSeatTypes: Map<string, MembershipSeatType>
): Map<string, MembershipSeatType> {
  const result = new Map<string, MembershipSeatType>();
  for (const sub of contract.subscriptions ?? []) {
    const seatType = getSeatTypeForSubscription(sub, productSeatTypes);
    if (seatType) {
      result.set(sub.subscription_rate.product.id, seatType);
    }
  }
  return result;
}

/**
 * Look up the per-seat AWU allocation for a given seat type from the
 * contract's recurring credits. Credits are linked to seat subscriptions
 * via `subscription_config.subscription_id` — we resolve that to a
 * subscription, then check the subscription's seat type.
 *
 * Returns 0 when the seat type has no recurring credit (e.g. workspace
 * seats on legacy plans).
 */
export function getAwuAllocationForSeatType(
  contract: Pick<CachedContract, "subscriptions" | "recurring_credits">,
  seatType: MembershipSeatType,
  productSeatTypes: Map<string, MembershipSeatType>
): number {
  const seatSubscriptions = getSeatSubscriptionsFromContract(
    contract,
    productSeatTypes
  );
  const subscription = seatSubscriptions.get(seatType);
  if (!subscription?.id) {
    return 0;
  }
  const credit = (contract.recurring_credits ?? []).find(
    (c) => c.subscription_config?.subscription_id === subscription.id
  );
  return credit?.access_amount.unit_price ?? 0;
}

/**
 * Outcome of classifying a seat transition (from → to) on a contract.
 *
 * - `noop`: identical seat types, or both have zero allocation; no change to apply.
 * - `immediate`: apply the move right away. Used when allocation stays the
 *   same or increases — the user gains/keeps access immediately.
 * - `deferred`: defer to the next billing period. Used when the new seat
 *   has *lower* allocation than the current one — the user keeps the
 *   richer access through the period they already paid / consumed for.
 *
 * This decision is generic: no knowledge of pro/max/free names is needed,
 * only the allocations resolved from the contract's recurring credits.
 */
export type SeatTransitionPlan =
  | { kind: "noop" }
  | { kind: "immediate" }
  | { kind: "deferred"; at: Date };

/**
 * Ceil to midnight UTC to match how the invoice timestamp is displayed.
 * Billing period boundaries are anchored to the contract's creation time,
 * not midnight, so the raw timestamp needs the same normalization.
 */
function getNextBillingPeriodStart(
  contract: Pick<CachedContract, "subscriptions">
): Date | undefined {
  const nextStartingAt = (contract.subscriptions ?? [])
    .map((s) => s.billing_periods?.next?.starting_at)
    .find((d) => d !== undefined);
  if (!nextStartingAt) {
    return undefined;
  }
  const date = new Date(nextStartingAt);
  const floored = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  return floored.getTime() < date.getTime()
    ? new Date(floored.getTime() + 24 * 60 * 60 * 1000)
    : floored;
}

/**
 * Classify a seat transition generically by comparing allocations. The
 * caller doesn't need to know which seat types exist — only the contract.
 * Returns `undefined` when a deferred transition is required but the
 * contract has no next billing period to anchor it to.
 */
export function classifySeatTransition(
  contract: Pick<CachedContract, "subscriptions" | "recurring_credits">,
  productSeatTypes: Map<string, MembershipSeatType>,
  fromSeatType: MembershipSeatType,
  toSeatType: MembershipSeatType
): SeatTransitionPlan | undefined {
  if (fromSeatType === toSeatType) {
    return { kind: "noop" };
  }
  const fromAllocation = getAwuAllocationForSeatType(
    contract,
    fromSeatType,
    productSeatTypes
  );
  const toAllocation = getAwuAllocationForSeatType(
    contract,
    toSeatType,
    productSeatTypes
  );
  if (toAllocation >= fromAllocation) {
    return { kind: "immediate" };
  }
  const at = getNextBillingPeriodStart(contract);
  return at ? { kind: "deferred", at } : undefined;
}
