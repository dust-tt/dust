import { listMetronomeProducts } from "@app/lib/metronome/client";
import {
  FREE_SEAT_LIFETIME_AWU_CREDITS,
  SEAT_TYPE_CUSTOM_FIELD_KEY,
} from "@app/lib/metronome/constants";
import type { CachedContract } from "@app/lib/metronome/plan_type";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import type { SeatLimit } from "@app/lib/resources/workspace_seat_limit_resource";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";
import type {
  MembershipSeatType,
  NormalizedPoolLimitSeatType,
} from "@app/types/memberships";
import {
  isMembershipSeatType,
  NORMALIZED_POOL_LIMIT_SEAT_TYPES,
  normalizeToPoolLimitSeatType,
} from "@app/types/memberships";
import { assertNever } from "@app/types/shared/utils/assert_never";
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
 * The seat is chosen in three phases:
 *
 *  1. **Committed seats** — iterate `pro` and `pro_yearly` seat types ordered
 *     by AWU allowance ascending. For each type that has a committed allocation
 *     (`seatLimits.minSeats > 0`) with remaining slots (`assignedCount <
 *     minSeats`), assign it. Higher tiers (`max`, `workspace`, …) are never
 *     auto-assigned; they must be set manually.
 *
 *  2. **Free seat** — if `free` is on the contract and all of the following
 *     hold, assign `free`:
 *       - `isReturningMember` is false (`free` is a one-shot starter tier).
 *       - Active free-seat cap not exceeded.
 *       - Lifetime free-seat cap not exceeded.
 *
 *  3. **None** — all committed slots are taken and `free` is unavailable:
 *     return `"none"` (no-seat tier).
 *
 * Legacy contracts that carry no seat subscriptions return `"workspace"` early
 * and never reach the three phases.
 *
 * The workspace-wide active-member cap (`plan.limits.users.maxUsers`) is NOT
 * enforced here — it is already enforced upstream by
 * `evaluateWorkspaceSeatAvailability` (signup) and `invitation.ts`
 * (invite creation).
 */
export function getDefaultSeatTypeForContract(
  contract: CachedContract,
  productSeatTypes: Map<string, MembershipSeatType>,
  {
    isReturningMember = false,
    freeSeatCounts,
    freeSeatLimits,
    seatLimits,
    seatCounts,
  }: {
    isReturningMember?: boolean;
    freeSeatCounts?: FreeSeatCounts;
    freeSeatLimits?: FreeSeatLimits;
    seatLimits?: Map<MembershipSeatType, SeatLimit>;
    seatCounts?: Partial<Record<MembershipSeatType, number>>;
  } = {}
): MembershipSeatType {
  const seatTypesOnContract = [
    ...getSeatSubscriptionsFromContract(contract, productSeatTypes).keys(),
  ];
  if (seatTypesOnContract.length === 0) {
    return "none";
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

  // Only `pro` and `pro_yearly` are eligible for auto-assignment. Higher tiers
  // (`max`, `max_yearly`, `workspace`, `workspace_yearly`) must be assigned
  // manually; they are never handed out automatically to new joiners.
  const AUTO_ASSIGNABLE: ReadonlySet<MembershipSeatType> = new Set([
    "pro",
    "pro_yearly",
  ]);

  // Phase 1: assign to the cheapest committed seat type with remaining slots.
  // A seat type is committed if seatLimits.minSeats > 0. The commitment is
  // exhausted once assignedCount >= minSeats.
  for (const { seatType } of ordered) {
    if (!AUTO_ASSIGNABLE.has(seatType)) {
      continue;
    }
    const limit = seatLimits?.get(seatType);
    if (!limit || limit.minSeats <= 0) {
      continue;
    }
    const assignedCount = seatCounts?.[seatType] ?? 0;
    if (assignedCount < limit.minSeats) {
      return seatType;
    }
  }

  // Phase 2: committed seats exhausted — try "free" if on the contract and
  // the caller/workspace conditions allow it.
  if (seatTypesOnContract.includes("free")) {
    if (!isReturningMember) {
      const activeCapHit =
        freeSeatLimits !== undefined &&
        freeSeatCounts !== undefined &&
        freeSeatLimits.maxActiveFreeUsers !== -1 &&
        freeSeatCounts.active >= freeSeatLimits.maxActiveFreeUsers;
      const lifetimeCapHit =
        freeSeatLimits !== undefined &&
        freeSeatCounts !== undefined &&
        freeSeatLimits.maxLifetimeFreeUsers !== -1 &&
        freeSeatCounts.lifetime >= freeSeatLimits.maxLifetimeFreeUsers;
      if (!activeCapHit && !lifetimeCapHit) {
        return "free";
      }
    }
  }

  // Phase 3: no committed seat or free available.
  return "none";
}

/**
 * Seat product IDs the contract actually *sells*, i.e. whose effective
 * entitlement is `true`. Non-legacy rate cards carry every seat product at
 * `entitled: false`; each package/contract entitles only the seats it sells, so
 * a bare subscription does NOT mean the seat is billable — the entitlement
 * override does.
 *
 * A product can carry several overrides (e.g. the package entitles a seat, then
 * an operator switching the contract disables it). We resolve the EFFECTIVE
 * entitlement per product as the value of the override with the latest
 * `starting_at`; on a tie, a disabling (`entitled: false`) override wins, so an
 * operator's explicit opt-out beats a same-moment package entitlement.
 * Overrides without a `starting_at` (e.g. baseline package entitlements) sort
 * earliest, so any timestamped override supersedes them.
 */
function getEntitledSeatProductIds(
  contract: CachedContract,
  productSeatTypes: Map<string, MembershipSeatType>
): Set<string> {
  // productId → { startMs, entitled } of the currently-winning override.
  const effective = new Map<string, { startMs: number; entitled: boolean }>();
  for (const override of contract.overrides ?? []) {
    if (typeof override.entitled !== "boolean") {
      continue;
    }
    const entitled = override.entitled;
    const startMs = override.starting_at
      ? Date.parse(override.starting_at)
      : Number.NEGATIVE_INFINITY;
    const productIds = [
      override.product?.id,
      ...(override.override_specifiers ?? []).map((s) => s.product_id),
    ];
    for (const productId of productIds) {
      if (!productId || !productSeatTypes.has(productId)) {
        continue;
      }
      const current = effective.get(productId);
      // Later override wins; on an equal timestamp a disable beats an entitle.
      if (
        !current ||
        startMs > current.startMs ||
        (startMs === current.startMs && current.entitled && !entitled)
      ) {
        effective.set(productId, { startMs, entitled });
      }
    }
  }

  const ids = new Set<string>();
  for (const [productId, { entitled }] of effective) {
    if (entitled) {
      ids.add(productId);
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

  // Free seats no longer carry a recurring credit — their AWU grant is created
  // as a per-user contract credit at seat-assignment time (see
  // `grantFreeSeatCredits`). The allowance is therefore a code constant rather
  // than something discoverable on the contract's `recurring_credits`.
  if (seatType === "free") {
    return { credits: FREE_SEAT_LIFETIME_AWU_CREDITS, period: "lifetime" };
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

/**
 * The next time the per-seat AWU credit for `seatType` recurs (renews),
 * strictly after `now`.
 *
 * This is the credit *recurrence*, which is deliberately independent of the
 * subscription's billing period: in new pricing every per-seat AWU credit
 * recurs MONTHLY (see `getPerSeatIndividualAwuCredits` /
 * `buildPerSeatCredits` in `setup_new_pricing.ts`, which set
 * `recurrence_frequency: "MONTHLY"` for both the monthly and the annual
 * subscription of each seat pair). So a `pro_yearly` seat is billed once a
 * year but its allowance refreshes every month. We therefore step the
 * credit's recurrence anchor (the subscription's current billing-period
 * start) forward by its `recurrence_frequency` rather than reading
 * `billing_periods.next.starting_at`, which on an annual seat would point up
 * to a year out.
 *
 * Returns `undefined` when the seat carries no recurring credit (e.g. `free`,
 * whose AWU grant is a one-shot lifetime contract credit created at
 * assignment time — see `grantFreeSeatCredits` — or `none`), when the credit
 * never recurs (`lifetime`), or when the subscription exposes no
 * billing-period anchor. Callers decide the fallback.
 */
export function getNextSeatCreditRenewalDate({
  contract,
  seatType,
  productSeatTypes,
  now,
}: {
  contract: CachedContract;
  seatType: MembershipSeatType;
  productSeatTypes: Map<string, MembershipSeatType>;
  now: Date;
}): Date | undefined {
  const subscription = getSeatSubscriptionsFromContract(
    contract,
    productSeatTypes
  ).get(seatType);
  if (!subscription?.id) {
    return undefined;
  }

  const credit = (contract.recurring_credits ?? []).find(
    (c) => c.subscription_config?.subscription_id === subscription.id
  );
  if (!credit) {
    return undefined;
  }

  const period = getSeatAwuCreditsPeriod(credit);
  if (period === "lifetime") {
    return undefined;
  }

  // Recurrences are anchored at the subscription start and refresh every
  // `period`; the current billing-period start sits on that grid (one period
  // back for monthly seats, up to a year back for annual seats whose credit
  // still recurs monthly).
  const anchorIso =
    subscription.billing_periods?.current?.starting_at ??
    subscription.billing_periods?.next?.starting_at;
  if (!anchorIso) {
    return undefined;
  }

  // Step in UTC: `date-fns` add* operate in local time and would shift the
  // recurrence date across timezones. Month overflow is handled by `Date.UTC`
  // (e.g. month 13 → next January).
  const anchor = new Date(anchorIso);
  const addMonthsUtc = (months: number): Date =>
    new Date(
      Date.UTC(
        anchor.getUTCFullYear(),
        anchor.getUTCMonth() + months,
        anchor.getUTCDate(),
        anchor.getUTCHours(),
        anchor.getUTCMinutes(),
        anchor.getUTCSeconds(),
        anchor.getUTCMilliseconds()
      )
    );
  const step = (n: number): Date => {
    switch (period) {
      case "weekly":
        return new Date(anchor.getTime() + n * 7 * 24 * 60 * 60 * 1000);
      case "monthly":
        return addMonthsUtc(n);
      case "quarterly":
        return addMonthsUtc(3 * n);
      case "annual":
        return addMonthsUtc(12 * n);
      default:
        // `lifetime` already returned above; this guards new period values.
        return assertNever(period);
    }
  };

  // Step forward until the first occurrence strictly after `now`. Bounded:
  // the anchor is at most one period before `now`, except an annual seat with
  // a monthly credit, where it's at most ~12 months back.
  let next = anchor;
  for (let n = 1; next.getTime() <= now.getTime(); n++) {
    next = step(n);
  }
  return next;
}

/**
 * AWU allowance for a normalized pool-limit seat type (e.g. `"pro"`). Monthly
 * and yearly variants of a tier share the same allowance, so this resolves the
 * normalized type to whichever variant the contract actually sells and reads
 * its allowance — a direct `getAwuAllocationForSeatType(contract, "pro", ...)`
 * returns 0 on a contract that only sells `"pro_yearly"`. Returns 0 when no
 * matching seat is sold.
 */
export function getAwuAllocationForNormalizedSeatType(
  contract: CachedContract,
  normalizedSeatType: NormalizedPoolLimitSeatType,
  productSeatTypes: Map<string, MembershipSeatType>
): number {
  const seatSubscriptions = getSeatSubscriptionsFromContract(
    contract,
    productSeatTypes
  );
  for (const actualSeatType of seatSubscriptions.keys()) {
    if (normalizeToPoolLimitSeatType(actualSeatType) === normalizedSeatType) {
      return getAwuAllocationForSeatType(
        contract,
        actualSeatType,
        productSeatTypes
      );
    }
  }
  return 0;
}

/**
 * Resolve the seat AWU allowance for each normalized pool-limit seat type of
 * the workspace's active contract. Returns an empty record when the workspace
 * has no active contract. Used to derive total per-user cap thresholds (pool
 * override + seat allowance) from the pool-only override persisted on
 * memberships.
 */
export async function getSeatAllowancesByNormalizedSeatType(
  workspaceId: string
): Promise<Partial<Record<NormalizedPoolLimitSeatType, number>>> {
  const contract = await getActiveContract(workspaceId);
  if (!contract) {
    return {};
  }
  const productSeatTypes = await getProductSeatTypes();
  const allowances: Partial<Record<NormalizedPoolLimitSeatType, number>> = {};
  for (const seatType of NORMALIZED_POOL_LIMIT_SEAT_TYPES) {
    allowances[seatType] = getAwuAllocationForNormalizedSeatType(
      contract,
      seatType,
      productSeatTypes
    );
  }
  return allowances;
}
