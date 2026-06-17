import {
  clearPerUserCreditBalanceAlerts,
  upsertPerUserCreditBalanceAlerts,
} from "@app/lib/metronome/alerts/per_user_credit_balance";
import {
  addPerUserCreditToContract,
  adjustSeatCreditBalances,
  archiveContractCredit,
  findSeatCreditSegmentForPeriod,
  getMetronomeContractById,
  getMetronomeSeatActiveSince,
  getMetronomeSubscriptionAssignedSeatIds,
  getMetronomeSubscriptionSeatState,
  listContractPerUserCreditBalances,
  listContractPerUserCreditUserIds,
  listMetronomeSeatBalances,
  updateSubscriptionQuantity,
  updateSubscriptionSeats,
} from "@app/lib/metronome/client";
import {
  AWU_PRIORITY_FREE_SEAT_CREDIT,
  CONTRACT_CREDIT_TYPE_FREE_SEAT,
  FREE_SEAT_LIFETIME_AWU_CREDITS,
  getCreditTypeAwuId,
  getProductSeatSubscriptionCreditsId,
} from "@app/lib/metronome/constants";
import type { CachedContract } from "@app/lib/metronome/plan_type";
import {
  getAwuAllocationForSeatType,
  getNextSeatCreditRenewalDate,
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
  getSeatTypeForSubscription,
  isMauContract,
} from "@app/lib/metronome/seat_types";
import {
  FREE_SEAT_CREDIT_NAME,
  MAX_SEAT_CREDIT_NAME,
  PRO_SEAT_CREDIT_NAME,
  USAGE_TAG,
} from "@app/lib/metronome/setup_common";
import type { BillingFrequency } from "@app/lib/metronome/types";
import { isCreditPricedPlanPrefix } from "@app/lib/plans/plan_codes";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { SeatLimit } from "@app/lib/resources/workspace_seat_limit_resource";
import { WorkspaceSeatLimitResource } from "@app/lib/resources/workspace_seat_limit_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  bestEffortInvalidateCacheWithRedis,
  cacheWithRedis,
} from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";
import { isMembershipSeatType, SEAT_TYPE_ORDER } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import { addYears } from "date-fns";

/**
 * Returns true if the contract is seat-billed (any subscription should be
 * synced as a seat). MAU contracts are excluded up-front via the contract's
 * `MAU_THRESHOLD` custom field — seat and MAU billing are mutually exclusive.
 *
 * Beyond MAU, we require at least one subscription whose product is tagged
 * with `DUST_SEAT_TYPE` (resolved via the Redis-cached product map). Untagged
 * subscriptions don't count — a contract holding only non-seat subscriptions
 * (e.g. usage-only) doesn't trigger seat sync.
 */
export async function hasContractSeatSubscription(
  contract: CachedContract
): Promise<boolean> {
  if (isMauContract(contract)) {
    return false;
  }
  const subscriptions = contract.subscriptions ?? [];
  if (subscriptions.length === 0) {
    return false;
  }
  const productSeatTypes = await getProductSeatTypes();
  return subscriptions.some((s) =>
    productSeatTypes.has(s.subscription_rate.product.id)
  );
}

async function fetchCachedContract({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
}): Promise<Result<CachedContract, Error>> {
  const contractResult = await getMetronomeContractById({
    metronomeCustomerId,
    metronomeContractId,
  });
  if (contractResult.isErr()) {
    logger.warn(
      {
        error: contractResult.error,
        metronomeCustomerId,
        metronomeContractId,
      },
      "[Metronome] Failed to retrieve contract while syncing seats"
    );
    return new Err(contractResult.error);
  }
  return new Ok(contractResult.value);
}

/**
 * Per-user seat-type change request. Used as input to `classifySeatChange`.
 *
 * `pendingScheduledChange` is the existing future-dated row for this user
 * (if any). It influences the classifier's output: re-selecting one's
 * current seat with a pending change pending → `cancelled`.
 */
export type SeatChangeRequest = {
  userId: string;
  previousSeatType: MembershipSeatType;
  newSeatType: MembershipSeatType;
  pendingScheduledChange?: {
    seatType: MembershipSeatType;
    at: Date;
  };
};

/**
 * Result returned by `classifySeatChange`. Tells the caller what DB state to
 * write next:
 *
 * - `noop`: no change required.
 * - `cancelled`: a previously-scheduled change should be cancelled (caller
 *   drops its DB future row via `cancelScheduledSeatChange`).
 * - `immediate`: the user should be moved to `newSeatType` right now (caller
 *   updates the active row in place via `updateMembershipSeat`; if a pending
 *   future row exists it should be cancelled first).
 * - `deferred`: the transition should be scheduled at `at` (caller calls
 *   `scheduleSeatChange`, which already replaces any pending future row).
 *
 * Once the DB is in the desired state, the caller invokes `syncSeatCount`
 * to reconcile Metronome with the DB.
 */
export type SeatChangeOutcome =
  | { kind: "noop" }
  | { kind: "cancelled" }
  | { kind: "immediate" }
  | { kind: "deferred"; at: Date };

/**
 * Pure classifier. Decides what DB write the caller should make, based on
 * the contract's allocations and any existing pending future change. Does
 * not call Metronome; reconciliation is `syncSeatCount`'s job.
 *
 * Branches:
 * - Same seat as current: `cancelled` if a pending future change exists,
 *   else `noop`.
 * - `free` → `none`: `noop`. A `free` seat is a one-shot tier that cannot be
 *   downgraded to no seat.
 * - New allocation ≥ previous: `immediate` (the user gains/keeps access
 *   right away).
 * - New allocation < previous: `deferred` to the next time the previous
 *   seat's AWU allowance renews, so the user keeps the richer access through
 *   the allowance they already paid for. Returns `undefined` when no renewal
 *   (or billing-period) date can be resolved to anchor the deferral.
 */
export function classifySeatChange({
  contract,
  productSeatTypes,
  change,
  now,
}: {
  contract: CachedContract;
  productSeatTypes: Map<string, MembershipSeatType>;
  change: SeatChangeRequest;
  now: Date;
}): SeatChangeOutcome | undefined {
  const { previousSeatType, newSeatType, pendingScheduledChange } = change;

  // Selecting the current seat. Either a no-op or — if there's a pending
  // future change — a cancellation of that pending change.
  if (previousSeatType === newSeatType) {
    return pendingScheduledChange ? { kind: "cancelled" } : { kind: "noop" };
  }

  // `free` is a one-shot tier that can't be given back: downgrading a free
  // seat to no seat is not allowed, so treat it as a no-op (the caller leaves
  // the membership untouched).
  if (previousSeatType === "free" && newSeatType === "none") {
    return { kind: "noop" };
  }

  const previousAllocation = getAwuAllocationForSeatType(
    contract,
    previousSeatType,
    productSeatTypes
  );
  const newAllocation = getAwuAllocationForSeatType(
    contract,
    newSeatType,
    productSeatTypes
  );
  // Keep or gain allowance — takes effect right away. This also covers
  // removing a seat that carried no allowance (e.g. workspace seats:
  // 0 >= 0): there's nothing already paid for to preserve, so the removal
  // is immediate.
  if (newAllocation >= previousAllocation) {
    return { kind: "immediate" };
  }

  // Losing allowance (downgrade, or removal of a seat that had allowance) —
  // defer until the previous seat's AWU allowance next renews, so the user
  // keeps the richer allowance they've already paid for until it would have
  // refreshed anyway. The renewal cadence is the credit's `recurrence_frequency`
  // (MONTHLY in new pricing, even for annually-billed seats — see
  // `getNextSeatCreditRenewalDate`), which is independent of the billing period.
  //
  // Defensive: a downgrade is always from a credit-bearing seat (`free` →
  // `none` is handled above as a no-op), but if the credit's recurrence can't
  // be resolved, fall back to the next billing-period start rather than
  // failing the change.
  const creditRenewalAt = getNextSeatCreditRenewalDate({
    contract,
    seatType: previousSeatType,
    productSeatTypes,
    now,
  });
  const fallbackNextStartingAt = (contract.subscriptions ?? [])
    .map((s) => s.billing_periods?.next?.starting_at)
    .find((d) => d !== undefined);
  const renewalAt =
    creditRenewalAt ??
    (fallbackNextStartingAt ? new Date(fallbackNextStartingAt) : undefined);
  if (!renewalAt) {
    return undefined;
  }

  // `renewalAt` is already the exact instant the allowance refreshes — no
  // rounding needed.
  return { kind: "deferred", at: renewalAt };
}

/**
 * Resolve the seat type a membership should move to on `contract`, per the
 * remap policy when switching contracts:
 *  - keep the current type if the contract still bills it;
 *  - if the current type is monthly and the contract bills its yearly
 *    equivalent (`<type>_yearly`), convert to yearly; conversely, if the
 *    current type is yearly and the contract bills only the monthly equivalent,
 *    convert to monthly;
 *  - otherwise delegate to `getDefaultSeatTypeForContract` (committed seat →
 *    free → none), using the caller-supplied `isReturningMember`,
 *    `seatLimits`, and `seatCounts`.
 *
 * `isReturningMember` defaults to `true` (conservative). Pass `false` only
 * when the user never held a real seat in this workspace (all prior rows had
 * `seatType = "none"`), allowing the fallback to assign `free`.
 *
 * Free-seat workspace caps (`freeSeatCounts` / `freeSeatLimits`) are not
 * checked here — those caps gate new-member creation, not contract remaps.
 */
export function resolveRemappedSeatType(
  currentSeatType: MembershipSeatType,
  contract: CachedContract,
  productSeatTypes: Map<string, MembershipSeatType>,
  { seatLimits }: { seatLimits?: Map<MembershipSeatType, SeatLimit> } = {}
): MembershipSeatType {
  const onContract = new Set(
    getSeatSubscriptionsFromContract(contract, productSeatTypes).keys()
  );
  // `free` is kept when the new contract still offers it; otherwise it lapses
  // to `none` (one-shot grant that doesn't transfer across contracts).
  if (currentSeatType === "free") {
    return onContract.has("free") ? "free" : "none";
  }
  // For paid seats, find the closest equivalent on the new contract.
  // `none` stays `none` (no seat to preserve).
  if (currentSeatType !== "none") {
    const currentOrder = SEAT_TYPE_ORDER[currentSeatType];
    // Candidates: seats on the contract at or above the user's current tier.
    const candidates = [...onContract].filter(
      (s) => s !== "none" && s !== "free" && SEAT_TYPE_ORDER[s] >= currentOrder
    );
    // Committed seats (`minSeats > 0`) take priority — they represent what the
    // workspace explicitly signed up for.
    const committed = candidates.filter(
      (s) => (seatLimits?.get(s)?.minSeats ?? 0) > 0
    );
    const pool = committed.length > 0 ? committed : candidates;
    if (pool.length > 0) {
      // Within the pool, prefer: same type > billing-frequency counterpart
      // (monthly↔yearly) > cheapest remaining (stable sort by name).
      if (pool.includes(currentSeatType)) {
        return currentSeatType;
      }
      const counterpart = currentSeatType.endsWith("_yearly")
        ? currentSeatType.slice(0, -"_yearly".length)
        : `${currentSeatType}_yearly`;
      if (isMembershipSeatType(counterpart) && pool.includes(counterpart)) {
        return counterpart;
      }
      return pool.sort(
        (a, b) => SEAT_TYPE_ORDER[a] - SEAT_TYPE_ORDER[b] || a.localeCompare(b)
      )[0];
    }
  }
  return "none";
}

/**
 * Remap existing memberships' seat types to the seat types billed by
 * `contract`, so that after a contract switch no membership ends up on a seat
 * type the new contract doesn't bill (which would leave it unbilled). Called
 * from `provisionMetronomeContract` BEFORE the seat sync, so the sync
 * reconciles the new contract against the remapped memberships.
 *
 * Timing follows the switch:
 *  - immediate switch (`swapAt === "current-hour"`): the seat type is updated
 *    in place now;
 *  - future switch: the change is scheduled at `startingAt` — the active row
 *    keeps the old seat type (the current contract keeps billing correctly)
 *    and a future row flips at `startingAt`, which the seat sync picks up as a
 *    future segment on the new contract.
 *
 * No-op for memberships already on a covered seat type. A membership with no
 * resolvable `UserResource` is logged and skipped; a DB error while applying a
 * change throws (internal error → 500), so the operator knows the remap was
 * incomplete rather than a member being silently left on an unbilled seat.
 */
export async function remapMembershipSeatTypesForContract({
  metronomeCustomerId,
  contractId,
  workspace,
  swapAt,
  startingAt,
  contract,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspace: LightWorkspaceType;
  swapAt: "current-hour" | "next-hour";
  startingAt: Date;
  contract?: CachedContract;
}): Promise<Result<undefined, Error>> {
  let resolvedContract: CachedContract;
  if (contract) {
    resolvedContract = contract;
  } else {
    const fetched = await fetchCachedContract({
      metronomeCustomerId,
      metronomeContractId: contractId,
    });
    if (fetched.isErr()) {
      return new Err(fetched.error);
    }
    resolvedContract = fetched.value;
  }

  const productSeatTypes = await getProductSeatTypes();
  const onContract = getSeatSubscriptionsFromContract(
    resolvedContract,
    productSeatTypes
  );
  logger.info(
    {
      workspaceId: workspace.sId,
      contractId,
      swapAt,
      startingAt: startingAt.toISOString(),
      contractSeatTypes: [...onContract.keys()],
      contractProductIds: (resolvedContract.subscriptions ?? []).map(
        (s) => s.subscription_rate.product.id
      ),
      productSeatTypeMapSize: productSeatTypes.size,
    },
    "[Metronome][remap] Resolved contract seat types"
  );
  // Non-seat contracts (e.g. MAU / legacy) have no seat types to remap to.
  if (onContract.size === 0) {
    logger.info(
      { workspaceId: workspace.sId, contractId },
      "[Metronome][remap] No seat types on contract — skipping remap"
    );
    return new Ok(undefined);
  }

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });
  logger.info(
    {
      workspaceId: workspace.sId,
      contractId,
      membershipCount: memberships.length,
      currentSeatTypes: memberships.map((m) => m.seatType),
    },
    "[Metronome][remap] Active memberships to consider"
  );
  if (memberships.length === 0) {
    return new Ok(undefined);
  }

  const [users, seatLimits] = await Promise.all([
    UserResource.fetchByModelIds(memberships.map((m) => m.userId)),
    WorkspaceSeatLimitResource.fetchByWorkspace({ workspace }),
  ]);
  const userByModelId = new Map(users.map((u) => [u.id, u]));

  // Apply immediately when the contract already started — either the operator
  // swapped at the current hour, or backdated the start to the past. Scheduling
  // a seat change at a past timestamp would retroactively close the current row
  // and create one that any membership added since the backdated start already
  // supersedes (so the remap would silently no-op). A genuinely future start is
  // the only case that schedules.
  const applyImmediately =
    swapAt === "current-hour" || startingAt.getTime() <= Date.now();

  for (const membership of memberships) {
    const user = userByModelId.get(membership.userId);
    if (!user) {
      logger.warn(
        {
          workspaceId: workspace.sId,
          contractId,
          userModelId: membership.userId,
        },
        "[Metronome][remap] No UserResource for membership — skipping"
      );
      continue;
    }

    const target = resolveRemappedSeatType(
      membership.seatType,
      resolvedContract,
      productSeatTypes,
      { seatLimits }
    );
    if (target === membership.seatType) {
      logger.info(
        {
          workspaceId: workspace.sId,
          contractId,
          userId: user.sId,
          currentSeatType: membership.seatType,
          target,
        },
        "[Metronome][remap] No seat-type change for membership"
      );
      continue;
    }
    logger.info(
      {
        workspaceId: workspace.sId,
        contractId,
        userId: user.sId,
        previousSeatType: membership.seatType,
        newSeatType: target,
        mode: applyImmediately ? "immediate" : "scheduled",
        scheduledAt: applyImmediately ? null : startingAt.toISOString(),
      },
      "[Metronome][remap] Remapping membership seat type"
    );
    // No try/catch: `updateMembershipSeat` / `scheduleSeatChange` are internal
    // methods — a DB failure throws → 500, surfacing that the remap didn't
    // fully apply rather than silently leaving a member on an unbilled seat.
    if (applyImmediately) {
      await membership.updateMembershipSeat({
        user,
        workspace,
        newSeatType: target,
        author: "no-author",
      });
    } else {
      await membership.scheduleSeatChange({
        user,
        workspace,
        newSeatType: target,
        scheduledAt: startingAt,
        author: "no-author",
      });
    }
  }

  return new Ok(undefined);
}

/**
 * Sync the Metronome seat subscription state to the DB. Reads the current
 * active memberships AND any scheduled future memberships, and reconciles
 * Metronome's seat assignments at every relevant timestamp (now + each
 * unique scheduled `startAt`).
 *
 * Always sets the absolute state per subscription — safe against race
 * conditions and idempotent on replay. No knowledge of specific seat-type
 * names is baked in: adding a new tier flows through as long as its
 * product carries the `DUST_SEAT_TYPE` custom field.
 *
 * Deferred transitions are written to Metronome with a future `starting_at`;
 * Metronome flips the segment automatically when the date is reached, so no
 * scheduler is required on our side. Re-running this sync at any point is
 * a no-op once Metronome and DB agree.
 *
 * Called from:
 * - membership create/revoke/update hooks
 * - contract provisioning after creation or migration
 * - admin-driven seat-type changes (via `updateMembershipSeatAndTrack`)
 */
// The free seat AWU grant is anchored on per-seat first-appearance, not on a
// recurring schedule: a recurring INDIVIDUAL credit either refills every period
// or closes its issuance window, so it can't grant "once per seat, ever,
// whenever the seat is assigned". Instead we grant a standalone contract credit
// scoped to the user via a `user_id` presentation specifier, idempotent on
// (workspaceId, userId), valid for one year from the grant.
//
// `syncSeatCount` runs on every membership change and reconciles full state, so
// it calls this for ALL currently-free users on each sync. We first list the
// contract's existing per-user credits and skip users already granted — so a
// steady-state sync makes a single read instead of one edit call per free user.
// The grant's `uniqueness_key` still guards against double-granting on the race
// between the read and a concurrent sync (a 409 returns `Ok(null)`). Listing
// includes expired/archived credits so a lapsed grant is not re-issued. This
// self-heals a grant that failed on a previous sync — a delta-only grant could
// miss a user permanently once their seat is assigned. Best-effort: a failure
// is logged but never fails (and retries) the seat reconciliation.
async function grantFreeSeatCredits({
  metronomeCustomerId,
  contractId,
  workspaceId,
  userIds,
  startingAt,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspaceId: string;
  userIds: string[];
  startingAt: Date;
}): Promise<void> {
  if (userIds.length === 0) {
    return;
  }

  // Skip users that already have a credit. On a read failure we fall back to
  // attempting every user — the grant is still idempotent via its uniqueness
  // key, so we never double-grant, only make redundant (no-op) edit calls.
  const alreadyGranted = await listContractPerUserCreditUserIds({
    metronomeCustomerId,
    metronomeContractId: contractId,
    creditName: FREE_SEAT_CREDIT_NAME,
  });
  if (alreadyGranted.isErr()) {
    logger.warn(
      { workspaceId, contractId, error: alreadyGranted.error },
      "[Metronome] Could not list existing free seat credits; attempting all grants (idempotent)"
    );
  }
  const grantedUserIds = alreadyGranted.isOk()
    ? alreadyGranted.value
    : new Set<string>();
  const toGrant = userIds.filter((userId) => !grantedUserIds.has(userId));

  // Grant the credit only for users that don't have one yet.
  await concurrentExecutor(
    toGrant,
    async (userId) => {
      const result = await addPerUserCreditToContract({
        metronomeCustomerId,
        metronomeContractId: contractId,
        productId: getProductSeatSubscriptionCreditsId(),
        creditTypeId: getCreditTypeAwuId(),
        contractCreditType: CONTRACT_CREDIT_TYPE_FREE_SEAT,
        amount: FREE_SEAT_LIFETIME_AWU_CREDITS,
        userId,
        productTags: [USAGE_TAG],
        startingAt,
        endingBefore: addYears(startingAt, 1),
        name: FREE_SEAT_CREDIT_NAME,
        priority: AWU_PRIORITY_FREE_SEAT_CREDIT,
        // Scope the key to the contract, not just the workspace+user: each
        // contract holds its own credit, so a switch-contract must be able to
        // grant a fresh credit on the new contract. A workspace+user key would
        // collide with the prior contract's grant and 422.
        uniquenessKey: `free-seat-credit:${contractId}:${userId}`,
      });
      if (result.isErr()) {
        logger.error(
          { workspaceId, contractId, userId, error: result.error },
          "[Metronome] Failed to grant free seat credit"
        );
      }
    },
    { concurrency: 4 }
  );

  // Ensure the per-user credit-balance alerts for EVERY current free user, not
  // just the ones granted above — they drive each user's low-balance / capped
  // transitions as they deplete the credit (the seat-balance alert can't, since
  // this isn't a seat balance). Idempotent upsert run each sync, so users
  // granted before this existed are backfilled. Best-effort: a failure is
  // logged and retried next sync.
  await concurrentExecutor(
    userIds,
    async (userId) => {
      const alertResult = await upsertPerUserCreditBalanceAlerts({
        metronomeCustomerId,
        workspaceId,
        userId,
        allowanceAwu: FREE_SEAT_LIFETIME_AWU_CREDITS,
      });
      if (alertResult.isErr()) {
        logger.error(
          { workspaceId, contractId, userId, error: alertResult.error },
          "[Metronome] Failed to upsert per-user free credit alerts"
        );
      }
    },
    { concurrency: 4 }
  );
}

// Revoke free-seat credits for users who once had one but are no longer on a
// free seat (e.g. upgraded to pro): archive the now-stale credit so it stops
// drawing against their usage, and drop its low/empty alerts. The grant's
// uniqueness key is left untouched (archive is a separate edit), so the user can
// never re-claim a free credit on this contract. Best-effort; runs each sync.
async function revokeFreeSeatCreditsForExFreeUsers({
  metronomeCustomerId,
  contractId,
  workspaceId,
  currentFreeUserIds,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspaceId: string;
  currentFreeUserIds: Set<string>;
}): Promise<void> {
  const activeCreditsResult = await listContractPerUserCreditBalances({
    metronomeCustomerId,
    metronomeContractId: contractId,
    contractCreditType: CONTRACT_CREDIT_TYPE_FREE_SEAT,
  });
  if (activeCreditsResult.isErr()) {
    logger.warn(
      { workspaceId, contractId, error: activeCreditsResult.error },
      "[Metronome] Could not list per-user credits to revoke; skipping"
    );
    return;
  }
  const toRevoke = [...activeCreditsResult.value.entries()].filter(
    ([userId]) => !currentFreeUserIds.has(userId)
  );
  if (toRevoke.length === 0) {
    return;
  }

  await concurrentExecutor(
    toRevoke,
    async ([userId, { creditIds }]) => {
      for (const creditId of creditIds) {
        const archiveResult = await archiveContractCredit({
          metronomeCustomerId,
          metronomeContractId: contractId,
          creditId,
        });
        if (archiveResult.isErr()) {
          logger.error(
            {
              workspaceId,
              contractId,
              userId,
              creditId,
              error: archiveResult.error,
            },
            "[Metronome] Failed to archive ex-free-seat credit"
          );
        }
      }
      const clearResult = await clearPerUserCreditBalanceAlerts({
        metronomeCustomerId,
        workspaceId,
        userId,
      });
      if (clearResult.isErr()) {
        logger.error(
          { workspaceId, contractId, userId, error: clearResult.error },
          "[Metronome] Failed to clear ex-free-seat credit alerts"
        );
      }
    },
    { concurrency: 4 }
  );
}

/**
 * The recurring per-seat AWU credit name for a seat type, or `null` when the
 * seat type has no recurring seat credit to transfer between:
 *  - `workspace`/`workspace_yearly`/`none`: no per-seat allowance;
 *  - `free`: its allowance is a one-shot per-user credit (archived on upgrade,
 *    see `revokeFreeSeatCreditsForExFreeUsers`), not a recurring seat credit.
 *
 * Monthly and yearly variants of a tier share the same credit name (they share
 * the recurring-credit definition — see `buildPerSeatCredits`).
 */
export function getSeatCreditNameForSeatType(
  seatType: MembershipSeatType
): string | null {
  switch (seatType) {
    case "pro":
    case "pro_yearly":
      return PRO_SEAT_CREDIT_NAME;
    case "max":
    case "max_yearly":
      return MAX_SEAT_CREDIT_NAME;
    case "free":
    case "workspace":
    case "workspace_yearly":
    case "none":
      return null;
    default:
      assertNever(seatType);
  }
}

export type SeatCreditTransfer = {
  userSId: string;
  oldSeatType: MembershipSeatType;
  newSeatType: MembershipSeatType;
  oldCreditName: string;
  newCreditName: string;
  // Remaining (unconsumed) balance on the old seat credit — emptied from it.
  remaining: number;
  // Amount already consumed on the old seat credit — carried onto the new one.
  consumed: number;
};

/**
 * Pure detection of seat-credit transfers needed to align ledgers after
 * immediate moves between two recurring-credit seats (e.g. `pro` → `max`).
 *
 * A transfer is needed when a user is still assigned to one allowance seat in
 * Metronome but the DB has already moved them to a different allowance seat,
 * and the old seat credit still has a positive balance. The caller then empties
 * the old credit (by `remaining`) and debits the new one (by `consumed`), so
 * the move carries usage over instead of resetting it — e.g. 2000/8000 used on
 * `pro` becomes 2000/40000 used on `max` (remaining 6000 → 38000).
 *
 * Keying the trigger on "old credit still has a balance" makes the whole thing
 * idempotent: once the old credit is emptied, a re-run finds nothing to do.
 *
 * Also covers same-allowance moves between billing frequencies (e.g. `max` →
 * `max_yearly`): they share a credit name but are distinct recurring credits,
 * so the consumed amount still carries from one pool to the other.
 */
export function computeSeatCreditTransfers({
  metronomeSeatByUser,
  desiredSeatByUser,
  balanceByUser,
  allocationBySeatType,
}: {
  metronomeSeatByUser: Map<string, MembershipSeatType>;
  desiredSeatByUser: Map<string, MembershipSeatType>;
  // The seat's remaining AWU balance (aggregate across its credit pools; after
  // prior origins are emptied this equals the current tier's balance).
  balanceByUser: Map<string, number>;
  // The origin tier's per-seat AWU allocation. Consumption is derived from this
  // (allocation − remaining), NOT from the seat's aggregate starting balance —
  // that aggregate includes prior tiers we emptied to zero, which would be
  // mis-counted as consumption (e.g. emptied pro's 8000 inflating a max→yearly
  // transfer).
  allocationBySeatType: Map<MembershipSeatType, number>;
}): SeatCreditTransfer[] {
  const transfers: SeatCreditTransfer[] = [];
  for (const [userSId, oldSeatType] of metronomeSeatByUser) {
    const newSeatType = desiredSeatByUser.get(userSId);
    if (!newSeatType || newSeatType === oldSeatType) {
      continue;
    }
    const oldCreditName = getSeatCreditNameForSeatType(oldSeatType);
    const newCreditName = getSeatCreditNameForSeatType(newSeatType);
    // Both ends must be recurring-credit seats. (Distinct seat types always map
    // to distinct recurring credits, even when they share a credit name — the
    // transfer targets credits by id, not name.)
    if (!oldCreditName || !newCreditName) {
      continue;
    }
    const remaining = balanceByUser.get(userSId);
    // No balance left → nothing to carry over (fresh seat, or already
    // transferred on a prior run).
    if (remaining === undefined || remaining <= 0) {
      continue;
    }
    const allocation = allocationBySeatType.get(oldSeatType);
    if (allocation === undefined) {
      continue;
    }
    transfers.push({
      userSId,
      oldSeatType,
      newSeatType,
      oldCreditName,
      newCreditName,
      remaining,
      consumed: Math.max(0, allocation - remaining),
    });
  }
  return transfers;
}

async function findSeatCreditSegmentCached(
  cache: Map<
    string,
    { creditId: string; segmentId: string; segmentStartingAt: string } | null
  >,
  args: {
    metronomeCustomerId: string;
    metronomeContractId: string;
    recurringCreditId: string;
  }
): Promise<{
  creditId: string;
  segmentId: string;
  segmentStartingAt: string;
} | null> {
  const cached = cache.get(args.recurringCreditId);
  if (cached !== undefined) {
    return cached;
  }
  const res = await findSeatCreditSegmentForPeriod(args);
  const seg = res.isOk() ? res.value : null;
  cache.set(args.recurringCreditId, seg);
  return seg;
}

/**
 * The timestamp at which a per-seat manual ledger entry must be made: a time
 * the seat is provably active AND within the credit segment. Reads the seat's
 * active-segment start from Metronome (seats become active on hour boundaries,
 * a "now" change only from the next boundary) and clamps it up to the credit
 * segment start (the entry must also fall inside the segment). Returns `null`
 * when the seat has no active window to adjust in (caller skips).
 */
async function resolveSeatAdjustmentTimestamp({
  metronomeCustomerId,
  contractId,
  subscriptionId,
  seatId,
  creditSegmentStartingAt,
}: {
  metronomeCustomerId: string;
  contractId: string;
  subscriptionId: string;
  seatId: string;
  creditSegmentStartingAt: string;
}): Promise<Date | null> {
  const activeSinceRes = await getMetronomeSeatActiveSince({
    metronomeCustomerId,
    contractId,
    subscriptionId,
    seatId,
  });
  if (activeSinceRes.isErr() || !activeSinceRes.value) {
    return null;
  }
  // Metronome requires the entry timestamp to be on an hour boundary. Use the
  // later of the seat's active-since and the credit segment start (both already
  // hour-aligned) — the seat is active from there, so it's a valid entry time
  // (matches what the Metronome UI accepts: e.g. 08:00 for a seat whose segment
  // started at 08:00).
  const startMs = Math.max(
    activeSinceRes.value.getTime(),
    new Date(creditSegmentStartingAt).getTime()
  );
  return new Date(startMs);
}

/**
 * Detect users who moved between two recurring-credit seats (Metronome still
 * has them on the old seat, the DB on the new one) and empty their old seat
 * credit. Returns the transfers whose old credit was successfully emptied, so
 * the caller can credit the new seat once it's been assigned.
 *
 * Runs BEFORE seat reconciliation while the old seat is still assigned: a
 * manual ledger entry requires the seat to be active at the adjustment
 * timestamp. Best-effort: a failure to read or empty one user's credit is
 * logged and that user is left out of the returned list (their new credit is
 * then not debited — the move stays usage-fresh rather than double-charged).
 */
async function emptyOriginSeatCreditsForTransfers({
  metronomeCustomerId,
  contractId,
  workspaceId,
  subscriptionIdBySeatType,
  recurringCreditIdBySeatType,
  allocationBySeatType,
  desiredSeatByUser,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspaceId: string;
  subscriptionIdBySeatType: Map<MembershipSeatType, string>;
  recurringCreditIdBySeatType: Map<MembershipSeatType, string>;
  allocationBySeatType: Map<MembershipSeatType, number>;
  desiredSeatByUser: Map<string, MembershipSeatType>;
}): Promise<SeatCreditTransfer[]> {
  const balancesRes = await listMetronomeSeatBalances({
    metronomeCustomerId,
    metronomeContractId: contractId,
  });
  if (balancesRes.isErr()) {
    logger.error(
      { workspaceId, contractId, error: balancesRes.error },
      "[Metronome] Failed to read seat balances for credit transfer — skipping"
    );
    return [];
  }
  const awuCreditTypeId = getCreditTypeAwuId();
  const balanceByUser = new Map<string, number>();
  for (const seat of balancesRes.value) {
    const awu = seat.balances.find((b) => b.credit_type_id === awuCreditTypeId);
    if (awu) {
      balanceByUser.set(seat.seat_id, awu.balance);
    }
  }

  // Metronome's current seat assignment per user (old state, before sync).
  const metronomeSeatByUser = new Map<string, MembershipSeatType>();
  for (const [seatType, subscriptionId] of subscriptionIdBySeatType) {
    const assignedRes = await getMetronomeSubscriptionAssignedSeatIds({
      metronomeCustomerId,
      contractId,
      subscriptionId,
    });
    if (assignedRes.isErr()) {
      logger.error(
        { workspaceId, contractId, seatType, error: assignedRes.error },
        "[Metronome] Failed to read assigned seats for credit transfer — skipping tier"
      );
      continue;
    }
    for (const userSId of assignedRes.value) {
      metronomeSeatByUser.set(userSId, seatType);
    }
  }

  const transfers = computeSeatCreditTransfers({
    metronomeSeatByUser,
    desiredSeatByUser,
    balanceByUser,
    allocationBySeatType,
  });

  const segmentCache = new Map<
    string,
    { creditId: string; segmentId: string; segmentStartingAt: string } | null
  >();
  const emptied: SeatCreditTransfer[] = [];
  for (const t of transfers) {
    const recurringCreditId = recurringCreditIdBySeatType.get(t.oldSeatType);
    if (!recurringCreditId) {
      logger.warn(
        { workspaceId, contractId, userId: t.userSId, credit: t.oldCreditName },
        "[Metronome] No recurring credit id for origin seat — skipping transfer"
      );
      continue;
    }
    const seg = await findSeatCreditSegmentCached(segmentCache, {
      metronomeCustomerId,
      metronomeContractId: contractId,
      recurringCreditId,
    });
    if (!seg) {
      logger.error(
        { workspaceId, contractId, userId: t.userSId, credit: t.oldCreditName },
        "[Metronome] No origin seat credit segment for transfer — skipping"
      );
      continue;
    }
    const subscriptionId = subscriptionIdBySeatType.get(t.oldSeatType);
    const timestamp = subscriptionId
      ? await resolveSeatAdjustmentTimestamp({
          metronomeCustomerId,
          contractId,
          subscriptionId,
          seatId: t.userSId,
          creditSegmentStartingAt: seg.segmentStartingAt,
        })
      : null;
    if (!timestamp) {
      logger.warn(
        { workspaceId, contractId, userId: t.userSId, credit: t.oldCreditName },
        "[Metronome] No active window for origin seat — skipping transfer"
      );
      continue;
    }
    logger.info(
      {
        workspaceId,
        contractId,
        userId: t.userSId,
        credit: t.oldCreditName,
        segmentStartingAt: seg.segmentStartingAt,
        adjustmentTimestamp: timestamp.toISOString(),
        amount: -t.remaining,
      },
      "[Metronome] Emptying origin seat credit for transfer"
    );
    const adjustRes = await adjustSeatCreditBalances({
      metronomeCustomerId,
      metronomeContractId: contractId,
      creditId: seg.creditId,
      segmentId: seg.segmentId,
      perSeatAmounts: { [t.userSId]: -t.remaining },
      reason: `Seat change ${t.oldSeatType}→${t.newSeatType}: empty origin credit`,
      timestamp,
      alignToHour: false,
    });
    if (adjustRes.isErr()) {
      logger.error(
        { workspaceId, contractId, userId: t.userSId, error: adjustRes.error },
        "[Metronome] Failed to empty origin seat credit — skipping transfer"
      );
      continue;
    }
    emptied.push(t);
  }
  return emptied;
}

/**
 * Set the new seat credit to its carried balance for each transfer whose origin
 * credit was emptied. Runs AFTER seat reconciliation, once the new seat is
 * assigned (the adjustment requires the seat to be active).
 *
 * The target balance is reconciled to an absolute value — `allocation −
 * consumed` — rather than blindly debited by `consumed`. A manual ledger entry
 * is a delta, so we read the seat's current balance on the new credit (at the
 * adjustment time) and apply the difference. This makes the move idempotent and
 * correctly restores the balance when returning to a credit that was emptied on
 * a previous move (e.g. `max → max_yearly → max`): the destination always ends
 * at `allocation − consumed`, whatever state it was left in. Best-effort.
 */
async function carryConsumptionToNewSeatCredits({
  metronomeCustomerId,
  contractId,
  workspaceId,
  transfers,
  subscriptionIdBySeatType,
  recurringCreditIdBySeatType,
  allocationBySeatType,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspaceId: string;
  transfers: SeatCreditTransfer[];
  subscriptionIdBySeatType: Map<MembershipSeatType, string>;
  recurringCreditIdBySeatType: Map<MembershipSeatType, string>;
  allocationBySeatType: Map<MembershipSeatType, number>;
}): Promise<void> {
  const awuCreditTypeId = getCreditTypeAwuId();
  const segmentCache = new Map<
    string,
    { creditId: string; segmentId: string; segmentStartingAt: string } | null
  >();
  for (const t of transfers) {
    const recurringCreditId = recurringCreditIdBySeatType.get(t.newSeatType);
    const targetAllocation = allocationBySeatType.get(t.newSeatType);
    if (!recurringCreditId || targetAllocation === undefined) {
      logger.warn(
        { workspaceId, contractId, userId: t.userSId, credit: t.newCreditName },
        "[Metronome] No recurring credit / allocation for new seat — origin already emptied"
      );
      continue;
    }
    const seg = await findSeatCreditSegmentCached(segmentCache, {
      metronomeCustomerId,
      metronomeContractId: contractId,
      recurringCreditId,
    });
    if (!seg) {
      logger.error(
        { workspaceId, contractId, userId: t.userSId, credit: t.newCreditName },
        "[Metronome] No destination seat credit segment for transfer — origin already emptied"
      );
      continue;
    }
    // The new seat was just assigned (active from the next hour boundary), so
    // adjust at its actual active-window start rather than the current hour.
    const subscriptionId = subscriptionIdBySeatType.get(t.newSeatType);
    const timestamp = subscriptionId
      ? await resolveSeatAdjustmentTimestamp({
          metronomeCustomerId,
          contractId,
          subscriptionId,
          seatId: t.userSId,
          creditSegmentStartingAt: seg.segmentStartingAt,
        })
      : null;
    if (!timestamp) {
      logger.warn(
        { workspaceId, contractId, userId: t.userSId, credit: t.newCreditName },
        "[Metronome] No active window for new seat — origin already emptied"
      );
      continue;
    }

    // Read the seat's current balance on the new credit at the adjustment time,
    // then compute the delta to reach `allocation − consumed`.
    const balancesRes = await listMetronomeSeatBalances({
      metronomeCustomerId,
      metronomeContractId: contractId,
      coveringDate: timestamp,
    });
    if (balancesRes.isErr()) {
      logger.error(
        {
          workspaceId,
          contractId,
          userId: t.userSId,
          error: balancesRes.error,
        },
        "[Metronome] Failed to read new seat balance for transfer — origin already emptied"
      );
      continue;
    }
    const currentBalance = balancesRes.value
      .find((s) => s.seat_id === t.userSId)
      ?.balances.find((b) => b.credit_type_id === awuCreditTypeId)?.balance;
    if (currentBalance === undefined) {
      logger.warn(
        { workspaceId, contractId, userId: t.userSId, credit: t.newCreditName },
        "[Metronome] New seat balance not found at adjustment time — origin already emptied"
      );
      continue;
    }

    const desiredBalance = Math.max(0, targetAllocation - t.consumed);
    const delta = desiredBalance - currentBalance;
    if (delta === 0) {
      continue;
    }
    logger.info(
      {
        workspaceId,
        contractId,
        userId: t.userSId,
        credit: t.newCreditName,
        adjustmentTimestamp: timestamp.toISOString(),
        currentBalance,
        desiredBalance,
        delta,
      },
      "[Metronome] Setting new seat credit to carried balance"
    );
    const adjustRes = await adjustSeatCreditBalances({
      metronomeCustomerId,
      metronomeContractId: contractId,
      creditId: seg.creditId,
      segmentId: seg.segmentId,
      perSeatAmounts: { [t.userSId]: delta },
      reason: `Seat change ${t.oldSeatType}→${t.newSeatType}: carry over consumed AWU`,
      timestamp,
      alignToHour: false,
    });
    if (adjustRes.isErr()) {
      logger.error(
        { workspaceId, contractId, userId: t.userSId, error: adjustRes.error },
        "[Metronome] Failed to set new seat credit to carried balance"
      );
    }
  }
}

export async function syncSeatCount({
  metronomeCustomerId,
  contractId,
  workspace,
  planCode,
  startingAt,
  contract,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspace: LightWorkspaceType;
  planCode: string;
  // Forced `starting_at` for the "now" reconciliation. Most callers leave it
  // undefined (uses Metronome's default, i.e. immediately). Scheduled future
  // segments always use their own `startAt` regardless of this value.
  startingAt?: string;
  contract?: CachedContract;
}): Promise<Result<undefined, Error>> {
  let didMutateSeatData = false;

  try {
    let resolvedContract: CachedContract;
    if (contract) {
      resolvedContract = contract;
    } else {
      const fetched = await fetchCachedContract({
        metronomeCustomerId,
        metronomeContractId: contractId,
      });
      if (fetched.isErr()) {
        return new Err(fetched.error);
      }
      resolvedContract = fetched.value;
    }

    const productSeatTypes = await getProductSeatTypes();
    // Only entitled seat subscriptions are billable. Every seat product exists
    // on every (non-legacy) contract, but setting a quantity on a non-entitled
    // subscription bills nothing — so `getSeatSubscriptionsFromContract` keeps
    // only the entitled ones (and all of them on legacy contracts that don't
    // express seat entitlement). A membership left on a non-entitled seat is
    // then treated the same as one whose subscription is absent: skipped here
    // and surfaced in the "not covered" warning below.
    const seatSubscriptions = [
      ...getSeatSubscriptionsFromContract(resolvedContract, productSeatTypes),
    ].flatMap(([seatType, sub]) => (sub.id ? [{ sub, seatType }] : []));

    if (seatSubscriptions.length === 0) {
      logger.warn(
        { workspaceId: workspace.sId, contractId },
        "[Metronome] No seat subscription found on contract — cannot sync seats"
      );
      return new Err(new Error("No seat subscription found on contract"));
    }

    // Read current + future DB state. Future memberships are scheduled seat
    // transitions: each row has `startAt > now` and represents the seat
    // type the user will be on from `startAt` forward. The companion "current"
    // row (with `endAt = startAt`) still appears in `getActiveMemberships`.
    const [{ memberships: activeMemberships }, futureMemberships, seatLimits] =
      await Promise.all([
        MembershipResource.getActiveMemberships({ workspace }),
        MembershipResource.getScheduledFutureMemberships({ workspace }),
        // Per-seat-type min/max configuration (only `minSeats` today). Used to
        // clamp the count sent to Metronome up to the configured floor.
        WorkspaceSeatLimitResource.fetchByWorkspace({ workspace }),
      ]);

    const legacy = !isCreditPricedPlanPrefix(planCode);

    // userSId → current seat type (the seat they are on right now).
    const currentSeatByUserSId = new Map<string, MembershipSeatType>();
    for (const m of activeMemberships) {
      const userSId = m.user?.sId;
      if (userSId) {
        currentSeatByUserSId.set(userSId, m.seatType);
      }
    }

    type ScheduledChange = {
      userSId: string;
      newSeatType: MembershipSeatType;
      at: Date;
    };
    const scheduledChanges: ScheduledChange[] = [];
    for (const m of futureMemberships) {
      const userSId = m.user?.sId;
      if (userSId) {
        scheduledChanges.push({
          userSId,
          newSeatType: m.seatType,
          at: m.startAt,
        });
      }
    }

    // Surface memberships whose seat type has no matching entitled subscription
    // on the contract (absent, or present but not entitled) — those users will
    // not be billed.
    const coveredSeatTypes = new Set(
      seatSubscriptions.map(({ seatType }) => seatType)
    );
    const uncoveredUsersBySeatType = new Map<MembershipSeatType, string[]>();
    for (const [userSId, seatType] of currentSeatByUserSId) {
      // `none` is intentionally unbilled — skip silently.
      if (seatType === "none") {
        continue;
      }
      if (!coveredSeatTypes.has(seatType)) {
        const bucket = uncoveredUsersBySeatType.get(seatType) ?? [];
        bucket.push(userSId);
        uncoveredUsersBySeatType.set(seatType, bucket);
      }
    }
    for (const [seatType, userSIds] of uncoveredUsersBySeatType) {
      logger.warn(
        {
          workspaceId: workspace.sId,
          contractId,
          seatType,
          memberCount: userSIds.length,
          userIds: userSIds,
        },
        "[Metronome] Memberships with seat type not covered by any entitled contract subscription — they will not be billed"
      );
    }

    // Reconcile each DISTINCT effective moment exactly once: the base moment
    // (the contract start `startingAt`, or now for an immediate sync) plus
    // every scheduled-change moment, deduped and in ascending order (so we
    // never overwrite a later segment with an earlier one). The base moment
    // often coincides with a scheduled remap (a future switch schedules the
    // remap at the contract start); deduping prevents reconciling that segment
    // twice, which would double-apply the unassigned-seat floor.
    const baseMs = startingAt ? Date.parse(startingAt) : Date.now();
    const effectiveTimestampsMs = Array.from(
      new Set([baseMs, ...scheduledChanges.map((c) => c.at.getTime())])
    ).sort((a, b) => a - b);

    // Compute the desired seat type per user at a given timestamp, by walking
    // scheduled changes from earliest up to (and including) `tMs`.
    const seatTypeAt = (
      userSId: string,
      tMs: number
    ): MembershipSeatType | undefined => {
      let seatType = currentSeatByUserSId.get(userSId);
      for (const c of scheduledChanges) {
        if (c.userSId === userSId && c.at.getTime() <= tMs) {
          seatType = c.newSeatType;
        }
      }
      return seatType;
    };

    // Returns desired sIds for `subSeatType` at `tMs`. Includes users whose
    // currently-active row maps to `subSeatType` AND who have not (yet)
    // scheduled themselves off it by `tMs`, plus users who scheduled
    // themselves onto it.
    const allUserSIds = new Set<string>([
      ...currentSeatByUserSId.keys(),
      ...scheduledChanges.map((c) => c.userSId),
    ]);
    const desiredSIdsAt = (
      subSeatType: MembershipSeatType,
      tMs: number
    ): string[] => {
      const sIds: string[] = [];
      for (const userSId of allUserSIds) {
        const userSeatType = seatTypeAt(userSId, tMs);
        // On legacy contracts, "none" members are Platform Seat members that
        // predate the seat system — count them alongside explicit "workspace" seats.
        const match =
          userSeatType === subSeatType ||
          (legacy && subSeatType === "workspace" && userSeatType === "none");
        if (match) {
          sIds.push(userSId);
        }
      }
      return sIds;
    };

    // Align seat-credit ledgers for immediate moves between two recurring-credit
    // seats (e.g. `pro` → `max`): carry the consumed AWU onto the new seat's
    // credit instead of resetting it. Only for the immediate "now" sync — a
    // forced `startingAt` is a contract switch / future remap, where seat
    // credits are reconciled by the new contract rather than transferred.
    //
    // Split around the seat loop because a manual ledger entry requires the
    // seat to be active at the adjustment timestamp: the old seat is emptied
    // here (still assigned), the new one credited after it's been assigned.
    // subscriptionId per recurring-credit seat type (pro/max families), used by
    // the credit-transfer steps below to resolve each seat's active window.
    const subscriptionIdBySeatType = new Map<MembershipSeatType, string>(
      seatSubscriptions.flatMap(({ sub, seatType }) =>
        sub.id && getSeatCreditNameForSeatType(seatType)
          ? [[seatType, sub.id] as const]
          : []
      )
    );
    // The recurring credit backing each seat type, resolved via the credit's
    // `subscription_config.subscription_id`. Two seat tiers can share a credit
    // NAME across the monthly and yearly products (e.g. two "Pro Seat
    // Credits"), so the ledger adjustment must target the credit by id, not by
    // name, or it can hit the wrong pool (where the seat isn't active).
    const recurringCreditIdBySeatType = new Map<MembershipSeatType, string>();
    const allocationBySeatType = new Map<MembershipSeatType, number>();
    for (const { sub, seatType } of seatSubscriptions) {
      if (!sub.id || !getSeatCreditNameForSeatType(seatType)) {
        continue;
      }
      const recurringCredit = (resolvedContract.recurring_credits ?? []).find(
        (c) => c.subscription_config?.subscription_id === sub.id
      );
      if (recurringCredit?.id) {
        recurringCreditIdBySeatType.set(seatType, recurringCredit.id);
      }
      allocationBySeatType.set(
        seatType,
        getAwuAllocationForSeatType(
          resolvedContract,
          seatType,
          productSeatTypes
        )
      );
    }
    let pendingCreditTransfers: SeatCreditTransfer[] = [];
    if (!startingAt) {
      pendingCreditTransfers = await emptyOriginSeatCreditsForTransfers({
        metronomeCustomerId,
        contractId,
        workspaceId: workspace.sId,
        subscriptionIdBySeatType,
        recurringCreditIdBySeatType,
        allocationBySeatType,
        desiredSeatByUser: currentSeatByUserSId,
      });
      didMutateSeatData =
        didMutateSeatData || pendingCreditTransfers.length > 0;
    }

    for (const { sub, seatType } of seatSubscriptions) {
      const subscriptionId = sub.id!;
      const quantityMode = sub.quantity_management_mode ?? "QUANTITY_ONLY";
      const seatLimit = seatLimits.get(seatType);

      if (quantityMode === "SEAT_BASED") {
        // One reconcile per distinct effective moment. `desiredSIds` is
        // evaluated at the SAME moment the segment is written to — so a future
        // contract start reflects the membership state at the start (post-remap)
        // rather than "now".
        for (const tMs of effectiveTimestampsMs) {
          const isImmediateBase = tMs === baseMs && !startingAt;
          // Immediate base sync: let Metronome default to "now" for both the
          // write (`starting_at`) and the read (`covering_date`). Any other
          // moment (forced start or a scheduled change) pins to that instant.
          const segmentStartingAt = isImmediateBase
            ? undefined
            : new Date(tMs).toISOString();
          const coveringDate = isImmediateBase ? undefined : new Date(tMs);
          const result = await reconcileSeatBasedSegment({
            metronomeCustomerId,
            contractId,
            subscriptionId,
            seatType,
            desiredSIds: desiredSIdsAt(seatType, tMs),
            seatLimit,
            startingAt: segmentStartingAt,
            coveringDate,
            workspaceId: workspace.sId,
          });
          if (result.isErr()) {
            return new Err(result.error);
          }
          didMutateSeatData = didMutateSeatData || result.value;
        }
      } else {
        // QUANTITY_ONLY: only sync the "now" total. Scheduled changes within
        // a quantity-only seat tier are not modeled — they're rare in practice
        // (free / unlimited tiers) and Metronome doesn't bill them per-seat.
        const actualQuantity = desiredSIdsAt(seatType, Date.now()).length;
        // Clamp up to the configured billing floor: below `minSeats` we still
        // bill the floor. `maxSeats` is deliberately NOT applied here — it is
        // an assignment-time cap, and billing must always reflect the actual
        // assigned count so members holding a seat are never unbilled.
        const quantity = clampSeatCountToMin(actualQuantity, seatLimit);
        logger.info(
          {
            workspaceId: workspace.sId,
            contractId,
            subscriptionId,
            seatType,
            actualQuantity,
            quantity,
            minSeats: seatLimit?.minSeats,
          },
          quantity !== actualQuantity
            ? "[Metronome] Updating seat quantity (clamped up to configured min)"
            : "[Metronome] Updating seat quantity"
        );
        const updateResult = await updateSubscriptionQuantity({
          metronomeCustomerId,
          contractId,
          subscriptionId,
          quantity,
          startingAt,
        });
        if (updateResult.isErr()) {
          return new Err(updateResult.error);
        }
        didMutateSeatData = true;
      }
    }

    // New seats are now assigned, so their credits exist: carry the consumed
    // AWU emptied from the origin seats onto them (see above).
    if (pendingCreditTransfers.length > 0) {
      await carryConsumptionToNewSeatCredits({
        metronomeCustomerId,
        contractId,
        workspaceId: workspace.sId,
        transfers: pendingCreditTransfers,
        subscriptionIdBySeatType,
        recurringCreditIdBySeatType,
        allocationBySeatType,
      });
    }

    // Per-user AWU grant/revoke for free members. Driven off DB membership
    // state (`desiredSIdsAt`), NOT off a Metronome free-seat subscription: free
    // seats are never billed and may not be an entitled SEAT_BASED subscription
    // on the contract, so this runs independently of the seat-subscription loop
    // above. Best-effort and idempotent. Grant deduped by the grant's uniqueness
    // key; revoke archives the credit + drops alerts for users who left the free
    // seat (the uniqueness key stays claimed, so they can't re-claim).
    const currentFreeUserIds = new Set(desiredSIdsAt("free", baseMs));
    await grantFreeSeatCredits({
      metronomeCustomerId,
      contractId,
      workspaceId: workspace.sId,
      userIds: [...currentFreeUserIds],
      startingAt: new Date(baseMs),
    });
    await revokeFreeSeatCreditsForExFreeUsers({
      metronomeCustomerId,
      contractId,
      workspaceId: workspace.sId,
      currentFreeUserIds,
    });

    return new Ok(undefined);
  } finally {
    if (didMutateSeatData) {
      await invalidateCachedSeatDataByUserId({
        metronomeCustomerId,
        contractId,
      });
    }
  }
}

/**
 * Clamp a seat count up to the configured `minSeats` billing floor. Counts at
 * or above the floor (or with no limit configured) are returned unchanged.
 * `maxSeats` is intentionally not applied: it caps new assignments, never the
 * billed quantity — billing must reflect the seats actually held.
 */
function clampSeatCountToMin(
  count: number,
  seatLimit: SeatLimit | undefined
): number {
  return seatLimit ? Math.max(count, seatLimit.minSeats) : count;
}

/**
 * Reconcile one SEAT_BASED segment for a single subscription. Reads the
 * current assignment from Metronome at `coveringDate` (defaults to now) and
 * applies only the delta. Idempotent against repeated invocations.
 *
 * When a `minSeats` floor is configured and fewer real users are assigned than
 * the floor, the shortfall is added as *unassigned* seats so the contracted
 * minimum is still billed. The unassigned count is reconciled to the exact
 * desired value (added or removed) so repeated runs converge.
 */
async function reconcileSeatBasedSegment({
  metronomeCustomerId,
  contractId,
  subscriptionId,
  seatType,
  desiredSIds,
  seatLimit,
  startingAt,
  coveringDate,
  workspaceId,
}: {
  metronomeCustomerId: string;
  contractId: string;
  subscriptionId: string;
  seatType: MembershipSeatType;
  desiredSIds: string[];
  seatLimit?: SeatLimit;
  startingAt?: string;
  coveringDate?: Date;
  workspaceId: string;
}): Promise<Result<boolean, Error>> {
  const currentResult = await getMetronomeSubscriptionSeatState({
    metronomeCustomerId,
    contractId,
    subscriptionId,
    coveringDate,
  });
  if (currentResult.isErr()) {
    return new Err(currentResult.error);
  }
  const { assignedSeatIds, unassignedSeats: currentUnassigned } =
    currentResult.value;

  // `maxSeats` is deliberately not enforced here: it caps new assignments
  // (`seat_limit_reached` upstream), never the synced state. Every member who
  // actually holds a seat must stay assigned and billed in Metronome — e.g.
  // when an admin lowers the cap below the current headcount.
  const desired = new Set(desiredSIds);
  const current = new Set(assignedSeatIds);
  const addSeatIds = desiredSIds.filter((id) => !current.has(id));
  const removeSeatIds = assignedSeatIds.filter((id) => !desired.has(id));

  // Top up to the `minSeats` floor with unassigned seats when fewer real users
  // are assigned than the floor.
  const desiredUnassigned = Math.max(
    0,
    (seatLimit?.minSeats ?? 0) - desiredSIds.length
  );

  // Metronome auto-fills unassigned seats when seat IDs are added: each added
  // seat consumes one unassigned seat (total quantity unchanged) before
  // increasing the total. So by the time our explicit unassigned delta is
  // applied, the unassigned pool is already reduced by the number of seats we
  // assign in this same edit (floored at 0). Reconcile against that post-fill
  // baseline, NOT the raw current count — otherwise we'd double-count by both
  // letting Metronome auto-fill AND explicitly removing/adding a seat, which is
  // what caused the unassigned pool to balloon on every sync.
  // (`removeSeatIds` decrease the total quantity rather than returning seats to
  // the unassigned pool, so they don't affect this baseline.)
  const unassignedAfterAutoFill = Math.max(
    0,
    currentUnassigned - addSeatIds.length
  );
  const addUnassignedSeats = Math.max(
    0,
    desiredUnassigned - unassignedAfterAutoFill
  );
  const removeUnassignedSeats = Math.max(
    0,
    unassignedAfterAutoFill - desiredUnassigned
  );

  // Snapshot of the current vs. desired seat state, logged on every reconcile
  // (including no-ops) so the assigned/unassigned/total counts are always
  // visible when debugging billing discrepancies.
  const currentAssigned = assignedSeatIds.length;
  const desiredAssigned = desiredSIds.length;
  const seatStateLog = {
    workspaceId,
    contractId,
    subscriptionId,
    seatType,
    minSeats: seatLimit?.minSeats,
    currentAssigned,
    currentUnassigned,
    currentTotal: currentAssigned + currentUnassigned,
    desiredAssigned,
    desiredUnassigned,
    desiredTotal: desiredAssigned + desiredUnassigned,
    startingAt,
  };

  if (
    addSeatIds.length === 0 &&
    removeSeatIds.length === 0 &&
    addUnassignedSeats === 0 &&
    removeUnassignedSeats === 0
  ) {
    logger.info(
      seatStateLog,
      "[Metronome] Seat-based subscription already in sync — no changes"
    );
    return new Ok(false);
  }

  logger.info(
    {
      ...seatStateLog,
      addCount: addSeatIds.length,
      removeCount: removeSeatIds.length,
      unassignedAfterAutoFill,
      addUnassignedSeats,
      removeUnassignedSeats,
    },
    "[Metronome] Updating seat-based subscription assignments"
  );

  const updateResult = await updateSubscriptionSeats({
    metronomeCustomerId,
    contractId,
    fromSubscriptionId: subscriptionId,
    addSeatIds,
    removeSeatIds,
    addUnassignedSeats,
    removeUnassignedSeats,
    startingAt,
  });
  if (updateResult.isErr()) {
    return new Err(updateResult.error);
  }
  return new Ok(true);
}

export type SeatData = {
  awuAllocation: number;
  billingFrequency: BillingFrequency | null;
};

/**
 * Query Metronome for all SEAT_BASED subscriptions on the contract and return
 * a map of userId → { awuAllocation, billingFrequency }. Makes a single
 * contract fetch and one seat-ID fetch per subscription.
 *
 * Returns an Err on any contract or seat-ID fetch failure.
 */
export async function buildSeatDataByUserId({
  metronomeCustomerId,
  contractId,
}: {
  metronomeCustomerId: string;
  contractId: string;
}): Promise<Result<Map<string, SeatData>, Error>> {
  const contractResult = await getMetronomeContractById({
    metronomeCustomerId,
    metronomeContractId: contractId,
  });
  if (contractResult.isErr()) {
    logger.warn(
      { error: contractResult.error, metronomeCustomerId, contractId },
      "[Metronome] Failed to fetch contract"
    );
    return new Err(contractResult.error);
  }

  const contract = contractResult.value;
  const subscriptions = contract.subscriptions ?? [];
  const productSeatTypes = await getProductSeatTypes();

  const results = await concurrentExecutor(
    subscriptions,
    async (sub) => {
      if (sub.quantity_management_mode !== "SEAT_BASED" || !sub.id) {
        return new Ok(null);
      }
      const seatType = getSeatTypeForSubscription(sub, productSeatTypes);
      if (!seatType) {
        return new Ok(null);
      }
      const awuAllocation = getAwuAllocationForSeatType(
        contract,
        seatType,
        productSeatTypes
      );
      if (awuAllocation === 0) {
        return new Ok(null);
      }

      const seatIdsResult = await getMetronomeSubscriptionAssignedSeatIds({
        metronomeCustomerId,
        contractId,
        subscriptionId: sub.id,
      });
      if (seatIdsResult.isErr()) {
        logger.warn(
          {
            error: seatIdsResult.error,
            metronomeCustomerId,
            contractId,
            subscriptionId: sub.id,
            seatType,
          },
          "[Metronome] Failed to fetch seat IDs"
        );
        return new Err(seatIdsResult.error);
      }

      const freq = sub.subscription_rate.billing_frequency;
      return new Ok({
        seatIds: seatIdsResult.value,
        awuAllocation,
        billingFrequency: freq === "MONTHLY" || freq === "ANNUAL" ? freq : null,
      });
    },
    { concurrency: 10 }
  );

  const seatDataByUserId = new Map<string, SeatData>();
  for (const result of results) {
    if (result.isErr()) {
      return new Err(result.error);
    }
    const subSeatData = result.value;
    if (subSeatData) {
      for (const seatId of subSeatData.seatIds) {
        seatDataByUserId.set(seatId, {
          awuAllocation: subSeatData.awuAllocation,
          billingFrequency: subSeatData.billingFrequency,
        });
      }
    }
  }

  return new Ok(seatDataByUserId);
}

const SEAT_DATA_CACHE_TTL_MS = 60 * 1000;

const seatDataCacheResolver = ({
  metronomeCustomerId,
  contractId,
}: {
  metronomeCustomerId: string;
  contractId: string;
}) => `${metronomeCustomerId}-${contractId}`;

async function fetchSeatDataRecord(args: {
  metronomeCustomerId: string;
  contractId: string;
}): Promise<Record<string, SeatData>> {
  const seatDataResult = await buildSeatDataByUserId(args);
  // Throw at the cache boundary so a transient fetch failure is not cached.
  if (seatDataResult.isErr()) {
    throw seatDataResult.error;
  }
  return Object.fromEntries(seatDataResult.value);
}

export const getCachedSeatDataByUserId = cacheWithRedis(
  fetchSeatDataRecord,
  seatDataCacheResolver,
  { ttlMs: SEAT_DATA_CACHE_TTL_MS }
);

const invalidateCachedSeatDataByUserId = bestEffortInvalidateCacheWithRedis(
  fetchSeatDataRecord,
  seatDataCacheResolver,
  "members-usage seat data"
);
