import { MARKUP_MULTIPLIER } from "@app/lib/api/programmatic_usage/common";
import type { WorkspaceMetadata } from "@app/lib/api/workspace";
import { updateWorkspaceMetadata } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import {
  DEFAULT_MAX_CONVERSATIONS_PER_RUN,
  getMaxConversationsForBudgetAwuCredits,
} from "@app/lib/reinforcement/constants";
import {
  filterSkillsUnderSelfImprovementCap,
  getReinforcementBillingUnit,
  getReinforcementGlobalConsumptionStatus,
} from "@app/lib/reinforcement/enforcement";
import { SelfImprovingSkillsUsageResource } from "@app/lib/resources/self_improving_skills_usage_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

const CUTOFF = new Date("2026-01-02T00:00:00.000Z");
const IN_PERIOD = new Date("2026-01-03T00:00:00.000Z");

async function setup({
  creditPriced = false,
  metadata,
}: {
  creditPriced?: boolean;
  metadata?: WorkspaceMetadata;
} = {}) {
  const workspace = creditPriced
    ? await WorkspaceFactory.creditPriced()
    : await WorkspaceFactory.basic();

  if (metadata) {
    await updateWorkspaceMetadata(workspace, metadata);
  }

  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "admin" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  await SpaceFactory.defaults(auth);

  return { workspace, auth };
}

async function createSkill(
  auth: Authenticator,
  name: string
): Promise<SkillResource> {
  const skillModel = await SkillFactory.create(auth, { name });
  const skill = await SkillResource.fetchByModelIdWithAuth(auth, skillModel.id);
  if (!skill) {
    throw new Error("Failed to create skill");
  }
  return skill;
}

async function recordUsage(
  auth: Authenticator,
  skill: SkillResource,
  { microUsd, awuCredits }: { microUsd: number; awuCredits: number }
) {
  await SelfImprovingSkillsUsageResource.bulkCreate(auth, [
    {
      createdAt: IN_PERIOD,
      skillId: skill.id,
      conversationId: null,
      priceMicroUsd: microUsd,
      priceAwuCredits: awuCredits,
    },
  ]);
}

describe("getReinforcementBillingUnit", () => {
  it("returns micro_usd for a workspace not billed by Metronome", async () => {
    const { auth } = await setup();
    expect(getReinforcementBillingUnit(auth)).toBe("micro_usd");
  });

  it("returns awu_credits for a credit-priced Metronome workspace", async () => {
    const { auth } = await setup({ creditPriced: true });
    expect(getReinforcementBillingUnit(auth)).toBe("awu_credits");
  });
});

describe("getReinforcementGlobalConsumptionStatus", () => {
  it("enforces in raw micro-USD for non-Metronome workspaces", async () => {
    const { auth } = await setup({
      metadata: {
        reinforcementCapMicroUsd: 50_000_000,
        // The AWU cap must be ignored on this billing mode.
        reinforcementCapAwuCredits: 1,
      },
    });
    const skill = await createSkill(auth, "Global Cap Skill");
    await recordUsage(auth, skill, { microUsd: 40_000_000, awuCredits: 4_706 });

    const status = await getReinforcementGlobalConsumptionStatus(auth, {
      periodStart: CUTOFF,
      unit: "micro_usd",
    });

    expect(status).toEqual({
      unit: "micro_usd",
      consumedMicroUsd: 40_000_000,
      capMicroUsd: 50_000_000,
      capReached: false,
    });
  });

  it("flags the micro-USD cap as reached", async () => {
    const { auth } = await setup({
      metadata: { reinforcementCapMicroUsd: 30_000_000 },
    });
    const skill = await createSkill(auth, "Global Cap Reached Skill");
    await recordUsage(auth, skill, { microUsd: 30_000_000, awuCredits: 3_530 });

    const status = await getReinforcementGlobalConsumptionStatus(auth, {
      periodStart: CUTOFF,
      unit: "micro_usd",
    });

    expect(status.unit).toBe("micro_usd");
    expect(status.capReached).toBe(true);
  });

  it("enforces in AWU credits for Metronome workspaces", async () => {
    const { auth } = await setup({
      creditPriced: true,
      metadata: {
        reinforcementCapAwuCredits: 5_000,
        // The micro-USD cap must be ignored on this billing mode, even when
        // the micro-USD consumption exceeds it.
        reinforcementCapMicroUsd: 1,
      },
    });
    const skill = await createSkill(auth, "AWU Global Cap Skill");
    await recordUsage(auth, skill, { microUsd: 34_000_000, awuCredits: 4_000 });

    const status = await getReinforcementGlobalConsumptionStatus(auth, {
      periodStart: CUTOFF,
      unit: "awu_credits",
    });

    expect(status).toEqual({
      unit: "awu_credits",
      consumedAwuCredits: 4_000,
      capAwuCredits: 5_000,
      capReached: false,
    });
  });

  it("flags the AWU credits cap as reached", async () => {
    const { auth } = await setup({
      creditPriced: true,
      metadata: { reinforcementCapAwuCredits: 3_000 },
    });
    const skill = await createSkill(auth, "AWU Global Cap Reached Skill");
    await recordUsage(auth, skill, { microUsd: 100, awuCredits: 3_000 });

    const status = await getReinforcementGlobalConsumptionStatus(auth, {
      periodStart: CUTOFF,
      unit: "awu_credits",
    });

    expect(status.unit).toBe("awu_credits");
    expect(status.capReached).toBe(true);
  });
});

describe("filterSkillsUnderSelfImprovementCap", () => {
  it("enforces marked-up micro-USD caps for non-Metronome workspaces", async () => {
    const { auth } = await setup({
      metadata: { selfImprovementCapPerSkillMicroUsd: 20_000_000 },
    });

    // Raw 20M => 26M with markup: over the 20M default cap.
    const overCapSkill = await createSkill(auth, "Over Cap Skill");
    await recordUsage(auth, overCapSkill, {
      microUsd: 20_000_000,
      // High AWU consumption must be ignored on this billing mode.
      awuCredits: 1_000_000,
    });

    // Raw 10M => 13M with markup: under the 20M default cap.
    const underCapSkill = await createSkill(auth, "Under Cap Skill");
    await recordUsage(auth, underCapSkill, {
      microUsd: 10_000_000,
      awuCredits: 1_177,
    });

    // Same consumption as overCapSkill but with a higher per-skill override.
    const customCapSkill = await createSkill(auth, "Custom Cap Skill");
    await customCapSkill.updateSelfImprovementCostsCap(30_000_000);
    await recordUsage(auth, customCapSkill, {
      microUsd: 20_000_000,
      awuCredits: 2_353,
    });

    const filtered = await filterSkillsUnderSelfImprovementCap(auth, {
      skills: [overCapSkill, underCapSkill, customCapSkill],
      createdAfter: CUTOFF,
      unit: "micro_usd",
    });

    expect(filtered.map((skill) => skill.sId).sort()).toEqual(
      [underCapSkill.sId, customCapSkill.sId].sort()
    );
    // Sanity-check the markup assumption behind the over-cap fixture.
    expect(20_000_000 * MARKUP_MULTIPLIER).toBeGreaterThan(20_000_000);
  });

  it("enforces AWU credits caps for Metronome workspaces", async () => {
    const { auth } = await setup({
      creditPriced: true,
      metadata: { selfImprovementCapPerSkillAwuCredits: 2_000 },
    });

    const overCapSkill = await createSkill(auth, "AWU Over Cap Skill");
    await recordUsage(auth, overCapSkill, {
      // Low micro-USD consumption must be ignored on this billing mode.
      microUsd: 100,
      awuCredits: 2_500,
    });

    const underCapSkill = await createSkill(auth, "AWU Under Cap Skill");
    await recordUsage(auth, underCapSkill, {
      // Micro-USD consumption way over the micro-USD default cap: ignored.
      microUsd: 999_000_000,
      awuCredits: 500,
    });

    // Same consumption as overCapSkill but with a higher per-skill override.
    const customCapSkill = await createSkill(auth, "AWU Custom Cap Skill");
    await customCapSkill.updateSelfImprovementCostsCapAwuCredits(3_000);
    await recordUsage(auth, customCapSkill, {
      microUsd: 100,
      awuCredits: 2_500,
    });

    const filtered = await filterSkillsUnderSelfImprovementCap(auth, {
      skills: [overCapSkill, underCapSkill, customCapSkill],
      createdAfter: CUTOFF,
      unit: "awu_credits",
    });

    expect(filtered.map((skill) => skill.sId).sort()).toEqual(
      [underCapSkill.sId, customCapSkill.sId].sort()
    );
  });

  it("keeps skills with no usage in the period", async () => {
    const { auth } = await setup({ creditPriced: true });
    const idleSkill = await createSkill(auth, "Idle Skill");

    const filtered = await filterSkillsUnderSelfImprovementCap(auth, {
      skills: [idleSkill],
      createdAfter: CUTOFF,
      unit: "awu_credits",
    });

    expect(filtered.map((skill) => skill.sId)).toEqual([idleSkill.sId]);
  });
});

describe("getMaxConversationsForBudgetAwuCredits", () => {
  it("derives the conversation budget from the remaining credits", () => {
    // 1_200 credits remaining / 10 credits per conversation = 120.
    expect(
      getMaxConversationsForBudgetAwuCredits({
        globalConsumptionAwuCredits: 800,
        globalCapAwuCredits: 2_000,
        remainingProgrammaticCreditsAwuCredits: 10_000,
      })
    ).toBe(120);
  });

  it("clamps to the remaining programmatic credits", () => {
    expect(
      getMaxConversationsForBudgetAwuCredits({
        globalConsumptionAwuCredits: 0,
        globalCapAwuCredits: 10_000,
        remainingProgrammaticCreditsAwuCredits: 120,
      })
    ).toBe(12);
  });

  it("returns 0 when the cap is exhausted", () => {
    expect(
      getMaxConversationsForBudgetAwuCredits({
        globalConsumptionAwuCredits: 2_000,
        globalCapAwuCredits: 2_000,
        remainingProgrammaticCreditsAwuCredits: 10_000,
      })
    ).toBe(0);
  });

  it("caps at DEFAULT_MAX_CONVERSATIONS_PER_RUN", () => {
    expect(
      getMaxConversationsForBudgetAwuCredits({
        globalConsumptionAwuCredits: 0,
        globalCapAwuCredits: 10_000_000,
        remainingProgrammaticCreditsAwuCredits: 10_000_000,
      })
    ).toBe(DEFAULT_MAX_CONVERSATIONS_PER_RUN);
  });
});
