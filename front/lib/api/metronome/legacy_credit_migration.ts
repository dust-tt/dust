import type { Authenticator } from "@app/lib/auth";
import { addCreditToContract } from "@app/lib/metronome/client";
import {
  AWU_PRIORITY_FREE_SEAT_CREDIT,
  AWU_PRIORITY_PURCHASED_COMMIT,
  getCreditTypeAwuId,
  getProductFreeCreditId,
  getProductPrepaidCommitId,
  oneYearAfter,
} from "@app/lib/metronome/constants";
import { USAGE_TAG } from "@app/lib/metronome/setup_common";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

// Conversion rate for legacy credits → AWU credits: $1 = 100 AWU.
const AWU_CREDITS_PER_DOLLAR = 100;

type LegacyMigrationCredits = {
  // Remaining (unconsumed) balance of the workspace's convertible credits
  // (committed + poke-granted free), in microUSD — the basis for the conversion.
  convertibleRemainingMicroUsd: number;
  // `convertibleRemainingMicroUsd` converted to AWU at $1 = 100 AWU.
  convertedAwuCredits: number;
  memberCount: number;
  // `memberCount * freeAwuCreditsPerUser`.
  bonusAwuCredits: number;
};

// Poke-granted free credits (manual one-off grants) carry an `invoiceOrLineItemId`
// of `free-poke-*`; monthly renewal free credits use `free-renewal-*` and are NOT
// converted.
function isConvertibleCredit(credit: {
  type: string;
  invoiceOrLineItemId: string | null;
}): boolean {
  if (credit.type === "committed") {
    return true;
  }
  return (
    credit.type === "free" &&
    (credit.invoiceOrLineItemId?.startsWith("free-poke-") ?? false)
  );
}

/**
 * Compute the AWU grants the legacy → Business migration should make for a
 * workspace, AS OF the moment this is called (balances and member counts drift
 * over the rollout window, so this is computed at activation time, not when the
 * migration is scheduled).
 *
 * Converts `committed` (purchased) credits and poke-granted free credits
 * (`free-poke-*`). Monthly renewal free credits (`free-renewal-*`) are
 * intentionally left behind. Read-only.
 */
async function computeLegacyMigrationCredits({
  auth,
  workspace,
  freeAwuCreditsPerUser,
}: {
  auth: Authenticator;
  workspace: LightWorkspaceType;
  freeAwuCreditsPerUser: number;
}): Promise<LegacyMigrationCredits> {
  const activeCredits = await CreditResource.listActive(auth);
  const convertibleRemainingMicroUsd = activeCredits
    .filter(isConvertibleCredit)
    .reduce(
      (sum, c) => sum + (c.initialAmountMicroUsd - c.consumedAmountMicroUsd),
      0
    );
  const convertedAwuCredits = Math.round(
    (convertibleRemainingMicroUsd / 1_000_000) * AWU_CREDITS_PER_DOLLAR
  );

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });
  const memberCount = memberships.length;
  const bonusAwuCredits = memberCount * freeAwuCreditsPerUser;

  return {
    convertibleRemainingMicroUsd,
    convertedAwuCredits,
    memberCount,
    bonusAwuCredits,
  };
}

/**
 * Apply the legacy → Business credit migration on the now-active contract:
 *  - convert the workspace's remaining convertible legacy credits (committed +
 *    poke-granted free) to AWU ($1 = 100 AWU) as a contract credit (no invoice);
 *  - grant the free per-user AWU bonus as a contract credit.
 *
 * Both credits are effective from the contract start (passed as `startingAt`,
 * i.e. the activation moment) and expire one year later. Called from the
 * `contract.start` webhook so the amounts reflect the workspace's state at
 * migration time. Best-effort: each grant failure is logged and does not throw,
 * so it never breaks subscription activation. Idempotent via uniqueness keys
 * keyed on the contract, so a webhook re-delivery does not double-grant.
 */
export async function applyLegacyCreditMigrationAtActivation({
  auth,
  workspace,
  metronomeCustomerId,
  metronomeContractId,
  startingAt,
  freeAwuCreditsPerUser,
}: {
  auth: Authenticator;
  workspace: LightWorkspaceType;
  metronomeCustomerId: string;
  metronomeContractId: string;
  startingAt: Date;
  freeAwuCreditsPerUser: number;
}): Promise<void> {
  const {
    convertibleRemainingMicroUsd,
    convertedAwuCredits,
    memberCount,
    bonusAwuCredits,
  } = await computeLegacyMigrationCredits({
    auth,
    workspace,
    freeAwuCreditsPerUser,
  });

  const startingAtIso = startingAt.toISOString();
  const endingBeforeIso = oneYearAfter(startingAt).toISOString();

  logger.info(
    {
      workspaceId: workspace.sId,
      metronomeContractId,
      convertibleRemainingMicroUsd,
      convertedAwuCredits,
      memberCount,
      bonusAwuCredits,
    },
    "[LegacyCreditMigration] Applying credit migration at activation"
  );

  // Converted legacy credits — purchased priority, consumed after the bonus.
  if (convertedAwuCredits > 0) {
    const res = await addCreditToContract({
      metronomeCustomerId,
      metronomeContractId,
      productId: getProductPrepaidCommitId(),
      creditTypeId: getCreditTypeAwuId(),
      amount: convertedAwuCredits,
      startingAt: startingAtIso,
      endingBefore: endingBeforeIso,
      name: `Legacy credit conversion: ${convertedAwuCredits.toLocaleString()} AWU`,
      uniquenessKey: `legacy-credit-conversion:${workspace.sId}:${metronomeContractId}`,
      applicableProductTags: [USAGE_TAG],
      priority: AWU_PRIORITY_PURCHASED_COMMIT,
    });
    if (res.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          metronomeContractId,
          error: normalizeError(res.error).message,
        },
        "[LegacyCreditMigration] Failed to grant converted legacy credits"
      );
    }
  }

  // Free migration bonus — free-credit priority so it is consumed first.
  if (bonusAwuCredits > 0) {
    const res = await addCreditToContract({
      metronomeCustomerId,
      metronomeContractId,
      productId: getProductFreeCreditId(),
      creditTypeId: getCreditTypeAwuId(),
      amount: bonusAwuCredits,
      startingAt: startingAtIso,
      endingBefore: endingBeforeIso,
      name: `Migration free credit: ${freeAwuCreditsPerUser} AWU x ${memberCount} users`,
      uniquenessKey: `legacy-migration-bonus:${workspace.sId}:${metronomeContractId}`,
      applicableProductTags: [USAGE_TAG],
      priority: AWU_PRIORITY_FREE_SEAT_CREDIT,
    });
    if (res.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          metronomeContractId,
          error: normalizeError(res.error).message,
        },
        "[LegacyCreditMigration] Failed to grant free migration credits"
      );
    }
  }
}
