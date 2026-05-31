import { listMetronomeProducts } from "@app/lib/metronome/client";
import { SEAT_TYPE_CUSTOM_FIELD_KEY } from "@app/lib/metronome/constants";
import type { CachedContract } from "@app/lib/metronome/plan_type";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";
import type { MembershipSeatType } from "@app/types/memberships";
import { isMembershipSeatType } from "@app/types/memberships";
import type { Subscription } from "@metronome/sdk/resources";

/**
 * Fetch all Metronome products and build a `productId → seatType` map from
 * the `DUST_SEAT_TYPE` custom field stamped on each product by the setup
 * script.
 *
 * Products are global per-environment (not workspace-scoped) and rarely
 * change, so the response is cached in Redis for 6h.
 *
 * Errors are intentionally NOT caught here: an empty map would be cached
 * for the full TTL, silently turning off seat sync for every workspace
 * until the cache expires. Letting the error propagate prevents that
 * stuck state — `cacheWithRedis` only memoizes successful results, so the
 * next call will retry against Metronome.
 */
async function fetchProductSeatTypes(): Promise<
  Record<string, MembershipSeatType>
> {
  const productsResult = await listMetronomeProducts();
  if (productsResult.isErr()) {
    throw productsResult.error;
  }
  const result: Record<string, MembershipSeatType> = {};
  for (const product of productsResult.value) {
    const value = product.custom_fields?.[SEAT_TYPE_CUSTOM_FIELD_KEY];
    if (value && isMembershipSeatType(value)) {
      result[product.id] = value;
    }
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
export function isMauContract(contract: CachedContract): boolean {
  return Boolean(contract.custom_fields?.MAU_THRESHOLD);
}

/**
 * Caps gating which seat tier `getDefaultSeatTypeForContract` is allowed
 * to pick. Sourced from the plan model
 * (`plan.limits.users.maxFreeUsers` / `maxLifetimeFreeUsers`); the caller
 * passes them in. Use `-1` to disable a limit (matches plan convention).
 */
export type FreeSeatLimits = {
  maxActiveFreeUsers: number;
  maxLifetimeFreeUsers: number;
};

/**
 * `free`-seat usage counts on the workspace. Built by
 * `MembershipResource.getFreeSeatCounts`. `lifetime` is across all
 * memberships ever (active + revoked + expired), since `free` is
 * one-shot per user.
 */
export type FreeSeatCounts = {
  active: number;
  lifetime: number;
};

/**
 * Returns the seat type to assign to a new membership on this contract.
 *
 * The default is derived from the contract itself — no rate-card custom
 * field. We order the seat tiers actually billed on the contract by AWU
 * allowance (ascending — the cheapest first) and pick the lowest tier.
 *
 * Legacy contracts carrying only untagged subscriptions (e.g. the legacy
 * MAU plan products) fall back to `"workspace"` — those subscriptions are
 * quantity-managed by `syncMauCount`, so the seat type is informational
 * only and `"workspace"` matches what new-tier enterprise contracts use.
 *
 * `free` is a one-shot starter tier (its lifetime AWU credit cannot be
 * re-granted). It is skipped, and the next tier in the ordering is
 * tried, when any of the following are true:
 *
 *   - `isReturningMember` is true (the user already had a membership row
 *     in this workspace at some point).
 *   - `useFreeSeat` is false (caller opted out, e.g. an admin invitation
 *     that should land on a paid tier directly).
 *   - `freeSeatCounts.active >= freeSeatLimits.maxActiveFreeUsers` (and
 *     the limit is not `-1`).
 *   - `freeSeatCounts.lifetime >= freeSeatLimits.maxLifetimeFreeUsers`
 *     (and the limit is not `-1`).
 *
 * Returns `undefined` when no remaining tier is assignable (e.g. a
 * free-only contract that has exhausted its lifetime cap).
 *
 * The workspace-wide active-member cap (`plan.limits.users.maxUsers`) is
 * NOT enforced here — it's already enforced upstream by
 * `evaluateWorkspaceSeatAvailability` (signup) and `invitation.ts` (invite
 * creation).
 */
export function getDefaultSeatTypeForContract(
  contract: CachedContract,
  productSeatTypes: Map<string, MembershipSeatType>,
  {
    isReturningMember = false,
    useFreeSeat = true,
    freeSeatCounts,
    freeSeatLimits,
  }: {
    isReturningMember?: boolean;
    useFreeSeat?: boolean;
    freeSeatCounts?: FreeSeatCounts;
    freeSeatLimits?: FreeSeatLimits;
  } = {}
): MembershipSeatType | undefined {
  const seatTypesOnContract = [
    ...getSeatSubscriptionsFromContract(contract, productSeatTypes).keys(),
  ];
  if (seatTypesOnContract.length === 0) {
    return "workspace";
  }
  const ordered = seatTypesOnContract
    .map((seatType) => ({
      seatType,
      awu: getAwuAllocationForSeatType(contract, seatType, productSeatTypes),
    }))
    // Stable secondary sort on the seat-type name keeps ordering
    // deterministic when two tiers share an allowance (e.g. workspace = 0
    // and free = 0 on a hybrid contract).
    .sort((a, b) => a.awu - b.awu || a.seatType.localeCompare(b.seatType));
  for (const { seatType } of ordered) {
    if (seatType === "free") {
      if (isReturningMember || !useFreeSeat) {
        continue;
      }
      if (
        freeSeatLimits &&
        freeSeatCounts &&
        freeSeatLimits.maxActiveFreeUsers !== -1 &&
        freeSeatCounts.active >= freeSeatLimits.maxActiveFreeUsers
      ) {
        continue;
      }
      if (
        freeSeatLimits &&
        freeSeatCounts &&
        freeSeatLimits.maxLifetimeFreeUsers !== -1 &&
        freeSeatCounts.lifetime >= freeSeatLimits.maxLifetimeFreeUsers
      ) {
        continue;
      }
    }
    return seatType;
  }
  return undefined;
}

/**
 * Seat product IDs the contract actually *sells*, i.e. flipped on with an
 * `entitled: true` override. Non-legacy rate cards carry every seat product at
 * `entitled: false`; each package/contract entitles only the seats it sells, so
 * a bare subscription does NOT mean the seat is billable — the entitlement
 * override does.
 */
function getEntitledSeatProductIds(
  contract: CachedContract,
  productSeatTypes: Map<string, MembershipSeatType>
): Set<string> {
  const ids = new Set<string>();
  for (const override of contract.overrides ?? []) {
    if (override.entitled !== true) {
      continue;
    }
    const productIds = [
      override.product?.id,
      ...(override.override_specifiers ?? []).map((s) => s.product_id),
    ];
    for (const productId of productIds) {
      if (productId && productSeatTypes.has(productId)) {
        ids.add(productId);
      }
    }
  }
  return ids;
}

/**
 * Walk a contract's subscriptions and build a `seatType → subscription`
 * index using the cached product seat-type map.
 *
 * Only seats the contract actually *sells* are included: a seat must be
 * entitled (`entitled: true` override) — a bare subscription is not enough,
 * since every package carries all seat subscriptions with the unsold ones at
 * `entitled: false`. Contracts that don't express seat entitlement at all
 * (legacy) fall back to including every seat subscription.
 */
export function getSeatSubscriptionsFromContract(
  contract: CachedContract,
  productSeatTypes: Map<string, MembershipSeatType>
): Map<MembershipSeatType, Subscription> {
  const entitledSeatProductIds = getEntitledSeatProductIds(
    contract,
    productSeatTypes
  );
  const result = new Map<MembershipSeatType, Subscription>();
  for (const sub of contract.subscriptions ?? []) {
    const seatType = getSeatTypeForSubscription(sub, productSeatTypes);
    if (!seatType) {
      continue;
    }
    // When the contract expresses seat entitlement, keep only entitled seats;
    // otherwise (no seat entitlement overrides → legacy) keep all.
    if (
      entitledSeatProductIds.size > 0 &&
      !entitledSeatProductIds.has(sub.subscription_rate.product.id)
    ) {
      continue;
    }
    result.set(seatType, sub);
  }
  return result;
}

/**
 * Build a `productId → seatType` map restricted to the products referenced
 * by the contract's subscriptions. Use when iterating a rate-card schedule
 * that exposes only product IDs.
 */
export function getSeatTypesByProductIdFromContract(
  contract: CachedContract,
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

export type SeatAwuCreditsPeriod =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "annual"
  | "lifetime";

export type SeatAwuAllocationInfo = {
  credits: number;
  period: SeatAwuCreditsPeriod;
};

function getSeatAwuCreditsPeriod(
  credit: NonNullable<CachedContract["recurring_credits"]>[number]
): SeatAwuCreditsPeriod {
  if (credit.commit_duration.value > 1) {
    return "lifetime";
  }

  switch (credit.recurrence_frequency) {
    case "WEEKLY":
      return "weekly";
    case "ANNUAL":
      return "annual";
    case "QUARTERLY":
      return "quarterly";
    case "MONTHLY":
    case undefined:
      return "monthly";
  }
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
export function getAwuAllocationInfoForSeatType(
  contract: CachedContract,
  seatType: MembershipSeatType,
  productSeatTypes: Map<string, MembershipSeatType>
): SeatAwuAllocationInfo {
  const seatSubscriptions = getSeatSubscriptionsFromContract(
    contract,
    productSeatTypes
  );
  const subscription = seatSubscriptions.get(seatType);
  if (!subscription?.id) {
    return { credits: 0, period: "monthly" };
  }
  const credit = (contract.recurring_credits ?? []).find(
    (c) => c.subscription_config?.subscription_id === subscription.id
  );
  if (!credit) {
    return { credits: 0, period: "monthly" };
  }

  return {
    credits: credit.access_amount.unit_price,
    period: getSeatAwuCreditsPeriod(credit),
  };
}

export function getAwuAllocationForSeatType(
  contract: CachedContract,
  seatType: MembershipSeatType,
  productSeatTypes: Map<string, MembershipSeatType>
): number {
  return getAwuAllocationInfoForSeatType(contract, seatType, productSeatTypes)
    .credits;
}
