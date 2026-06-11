import type { Authenticator } from "@app/lib/auth";
import {
  getReinforcementMonthlyCapAwuCredits,
  getReinforcementMonthlyCapMicroUsd,
  getWorkspaceDefaultSelfImprovementCapPerSkillAwuCredits,
  getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd,
} from "@app/lib/reinforcement/consumption";
import { SelfImprovingSkillsUsageResource } from "@app/lib/resources/self_improving_skills_usage_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isCreditPricedPlan } from "@app/types/plan";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * Billing-unit-aware enforcement of the reinforcement limits.
 *
 * Workspaces billed by Metronome (credit-priced plan) are enforced in AWU
 * credits (margin baked in); other workspaces in micro-USD (raw cost, markup
 * applied where the legacy path applies it).
 */

export type ReinforcementBillingUnit = "micro_usd" | "awu_credits";

/**
 * The unit in which the reinforcement limits of this workspace are enforced:
 * AWU credits for workspaces billed by Metronome on a credit-priced plan,
 * micro-USD otherwise.
 */
export function getReinforcementBillingUnit(
  auth: Authenticator
): ReinforcementBillingUnit {
  const workspace = auth.workspace();
  const plan = auth.subscription()?.plan;
  return workspace?.metronomeCustomerId && plan && isCreditPricedPlan(plan)
    ? "awu_credits"
    : "micro_usd";
}

// Micro-USD amounts are raw, without markup (matching the legacy global cap
// check); AWU credits have the margin baked in.
export type ReinforcementGlobalConsumptionStatus =
  | {
      unit: "micro_usd";
      consumedMicroUsd: number;
      capMicroUsd: number;
      capReached: boolean;
    }
  | {
      unit: "awu_credits";
      consumedAwuCredits: number;
      capAwuCredits: number;
      capReached: boolean;
    };

/**
 * Workspace-level reinforcement consumption for the period, compared against
 * the workspace monthly cap in the requested billing unit.
 */
export async function getReinforcementGlobalConsumptionStatus(
  auth: Authenticator,
  {
    periodStart,
    unit,
  }: {
    periodStart: Date;
    unit: ReinforcementBillingUnit;
  }
): Promise<ReinforcementGlobalConsumptionStatus> {
  const workspace = auth.getNonNullableWorkspace();
  const spend = await SelfImprovingSkillsUsageResource.getSumSpendAfterDate(
    auth,
    periodStart
  );

  switch (unit) {
    case "awu_credits": {
      const capAwuCredits = getReinforcementMonthlyCapAwuCredits(workspace);
      return {
        unit,
        consumedAwuCredits: spend.priceAwuCredits,
        capAwuCredits,
        capReached: spend.priceAwuCredits >= capAwuCredits,
      };
    }
    case "micro_usd": {
      const capMicroUsd = getReinforcementMonthlyCapMicroUsd(workspace);
      return {
        unit,
        consumedMicroUsd: spend.priceMicroUsd,
        capMicroUsd,
        capReached: spend.priceMicroUsd >= capMicroUsd,
      };
    }
    default:
      return assertNever(unit);
  }
}

/**
 * Filter out the skills that have reached their per-skill self-improvement
 * cap for the period, in the requested billing unit: AWU credits, or
 * marked-up micro-USD (matching the legacy per-skill cap check).
 */
export async function filterSkillsUnderSelfImprovementCap(
  auth: Authenticator,
  {
    skills,
    createdAfter,
    unit,
  }: {
    skills: SkillResource[];
    createdAfter: Date;
    unit: ReinforcementBillingUnit;
  }
): Promise<SkillResource[]> {
  if (skills.length === 0) {
    return [];
  }

  const workspace = auth.getNonNullableWorkspace();

  // The markup only affects the micro-USD component; AWU credits already
  // include the margin, so a single marked-up fetch serves both units.
  const skillConsumptionMap =
    await SelfImprovingSkillsUsageResource.getSumSpendWithMarkupAfterDateForSkills(
      auth,
      {
        createdAfter,
        skillModelIds: skills.map((skill) => skill.id),
      }
    );

  switch (unit) {
    case "awu_credits": {
      const defaultCapAwuCredits =
        getWorkspaceDefaultSelfImprovementCapPerSkillAwuCredits(workspace);
      return skills.filter((skill) => {
        const consumedAwuCredits =
          skillConsumptionMap.get(skill.id)?.priceAwuCredits ?? 0;
        const capAwuCredits =
          skill.selfImprovementCostsCapAwuCredits ?? defaultCapAwuCredits;
        return consumedAwuCredits < capAwuCredits;
      });
    }
    case "micro_usd": {
      const defaultCapMicroUsd =
        getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd(workspace);
      return skills.filter((skill) => {
        const consumedMicroUsd =
          skillConsumptionMap.get(skill.id)?.priceMicroUsd ?? 0;
        const capMicroUsd =
          skill.selfImprovementCostsCapMicroUsd ?? defaultCapMicroUsd;
        return consumedMicroUsd < capMicroUsd;
      });
    }
    default:
      return assertNever(unit);
  }
}
