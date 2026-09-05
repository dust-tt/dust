import {
  getEffectiveWhiteListedProviders,
  getWhitelistedProviders,
} from "@app/lib/api/assistant/models";
import {
  filterEnabledModels,
  isModelAvailable,
  isModelReleased,
} from "@app/lib/assistant";
import { Authenticator } from "@app/lib/auth";
import { FREE_NO_PLAN_DATA } from "@app/lib/plans/free_plans";
import {
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
  FREE_NO_PLAN_CODE,
  FREE_UPGRADED_PLAN_CODE,
  PRO_PLAN_SEAT_29_CODE,
} from "@app/lib/plans/plan_codes";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import { GPT_5_6_SOL_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { PlanType } from "@app/types/plan";
import type { RegionType } from "@app/types/region";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { WorkspaceType } from "@app/types/user";
import { describe, expect, it } from "vitest";

const TEST_REGION: RegionType = "us-central1";
const TEST_WORKSPACE: WorkspaceType = LightWorkspaceFactory.build();

function createMockModel(
  overrides: Partial<ModelConfigurationType>
): ModelConfigurationType {
  const baseModel = SUPPORTED_MODEL_CONFIGS[0];
  return {
    ...baseModel,
    ...overrides,
  };
}

function createMockPlan(
  code: string,
  { hasAdvancedModelAccess = false }: { hasAdvancedModelAccess?: boolean } = {}
): PlanType {
  return renderPlanFromModel({
    plan: {
      ...FREE_NO_PLAN_DATA,
      code,
      hasAdvancedModelAccess,
    },
  });
}

function isSolAvailable(
  plan: PlanType,
  featureFlags: WhitelistableFeature[] = []
) {
  return isModelAvailable(GPT_5_6_SOL_MODEL_CONFIG, {
    featureFlags,
    plan,
    regionalModelsOnly: TEST_WORKSPACE.regionalModelsOnly,
    region: TEST_REGION,
  });
}

describe("isModelAvailable", () => {
  it("should return true for a basic model without restrictions", () => {
    const model = createMockModel({ largeModel: false });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(
      isModelAvailable(model, {
        featureFlags: [],
        plan,
        regionalModelsOnly: TEST_WORKSPACE.regionalModelsOnly,
        region: TEST_REGION,
      })
    ).toBe(true);
  });

  it("should return true when featureFlag is enabled", () => {
    const model = createMockModel({
      availableIfOneOf: { featureFlag: "deepseek_feature" },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(
      isModelAvailable(model, {
        featureFlags: ["deepseek_feature"],
        plan,
        regionalModelsOnly: TEST_WORKSPACE.regionalModelsOnly,
        region: TEST_REGION,
      })
    ).toBe(true);
  });

  it("should return false when featureFlag is not enabled", () => {
    const model = createMockModel({
      availableIfOneOf: { featureFlag: "deepseek_feature" },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(
      isModelAvailable(model, {
        featureFlags: [],
        plan,
        regionalModelsOnly: TEST_WORKSPACE.regionalModelsOnly,
        region: TEST_REGION,
      })
    ).toBe(false);
  });

  it("should return true for large model with upgraded plan", () => {
    const model = createMockModel({ largeModel: true });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(
      isModelAvailable(model, {
        featureFlags: [],
        plan,
        regionalModelsOnly: TEST_WORKSPACE.regionalModelsOnly,
        region: TEST_REGION,
      })
    ).toBe(true);
  });

  it("should return true for large model with free upgraded plan", () => {
    const model = createMockModel({ largeModel: true });
    const plan = createMockPlan(FREE_UPGRADED_PLAN_CODE);

    expect(
      isModelAvailable(model, {
        featureFlags: [],
        plan,
        regionalModelsOnly: TEST_WORKSPACE.regionalModelsOnly,
        region: TEST_REGION,
      })
    ).toBe(true);
  });

  it("should return false for large model without upgraded plan", () => {
    const model = createMockModel({
      largeModel: true,
      availableIfOneOf: { plansWithAdvancedModels: true },
    });
    const plan = createMockPlan(FREE_NO_PLAN_CODE);

    expect(
      isModelAvailable(model, {
        featureFlags: [],
        plan,
        regionalModelsOnly: TEST_WORKSPACE.regionalModelsOnly,
        region: TEST_REGION,
      })
    ).toBe(false);
  });

  it("should return false for large model with null plan", () => {
    const model = createMockModel({
      largeModel: true,
      availableIfOneOf: { plansWithAdvancedModels: true },
    });

    expect(
      isModelAvailable(model, {
        featureFlags: [],
        plan: null,
        regionalModelsOnly: TEST_WORKSPACE.regionalModelsOnly,
        region: TEST_REGION,
      })
    ).toBe(false);
  });

  it("should return false when large model requires upgraded plan but featureFlag is missing", () => {
    const model = createMockModel({
      availableIfOneOf: { featureFlag: "deepseek_feature" },
      largeModel: true,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(
      isModelAvailable(model, {
        featureFlags: [],
        plan,
        regionalModelsOnly: TEST_WORKSPACE.regionalModelsOnly,
        region: TEST_REGION,
      })
    ).toBe(false);
  });

  describe("GPT 5.6 Sol availability", () => {
    it("should be configured as a large model", () => {
      expect(GPT_5_6_SOL_MODEL_CONFIG.largeModel).toBe(true);
    });

    it("should be available on credit-priced plans", () => {
      expect(
        isSolAvailable(createMockPlan(CREDIT_PRICED_BUSINESS_PLAN_CODE))
      ).toBe(true);
    });

    it("should be available when the plan has advanced model access", () => {
      const plan = createMockPlan(FREE_UPGRADED_PLAN_CODE, {
        hasAdvancedModelAccess: true,
      });

      expect(isSolAvailable(plan)).toBe(true);
    });

    it("should be available with the Opus feature flag", () => {
      const plan = createMockPlan(FREE_UPGRADED_PLAN_CODE);

      expect(isSolAvailable(plan, ["claude_4_5_opus_feature"])).toBe(true);
    });

    it("should be unavailable without an entitlement", () => {
      expect(isSolAvailable(createMockPlan(PRO_PLAN_SEAT_29_CODE))).toBe(false);
    });
  });

  it("should preserve the upgraded-plan requirement for other feature-gated large models", () => {
    const model = createMockModel({
      availableIfOneOf: { featureFlag: "deepseek_feature" },
      largeModel: true,
    });
    const plan = createMockPlan(FREE_NO_PLAN_CODE);

    expect(
      isModelAvailable(model, {
        featureFlags: ["deepseek_feature"],
        plan,
        regionalModelsOnly: TEST_WORKSPACE.regionalModelsOnly,
        region: TEST_REGION,
      })
    ).toBe(false);
  });

  it("should preserve the upgraded-plan requirement for other advanced large models", () => {
    const model = createMockModel({
      availableIfOneOf: { plansWithAdvancedModels: true },
      largeModel: true,
    });
    const plan = createMockPlan(FREE_NO_PLAN_CODE, {
      hasAdvancedModelAccess: true,
    });

    expect(
      isModelAvailable(model, {
        featureFlags: [],
        plan,
        regionalModelsOnly: TEST_WORKSPACE.regionalModelsOnly,
        region: TEST_REGION,
      })
    ).toBe(false);
  });

  it("should return true when plansWithAdvancedModels is set and plan has advanced model access", () => {
    const model = createMockModel({
      availableIfOneOf: { plansWithAdvancedModels: true },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE, {
      hasAdvancedModelAccess: true,
    });

    expect(
      isModelAvailable(model, {
        featureFlags: [],
        plan,
        regionalModelsOnly: TEST_WORKSPACE.regionalModelsOnly,
        region: TEST_REGION,
      })
    ).toBe(true);
  });

  it("should return false when plansWithAdvancedModels is set but plan lacks advanced model access", () => {
    const model = createMockModel({
      availableIfOneOf: { plansWithAdvancedModels: true },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE, {
      hasAdvancedModelAccess: false,
    });

    expect(
      isModelAvailable(model, {
        featureFlags: [],
        plan,
        regionalModelsOnly: TEST_WORKSPACE.regionalModelsOnly,
        region: TEST_REGION,
      })
    ).toBe(false);
  });

  it("should return true when both plansWithAdvancedModels and featureFlag are set, with advanced model access", () => {
    const model = createMockModel({
      availableIfOneOf: {
        plansWithAdvancedModels: true,
        featureFlag: "deepseek_feature",
      },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE, {
      hasAdvancedModelAccess: true,
    });

    expect(
      isModelAvailable(model, {
        featureFlags: [],
        plan,
        regionalModelsOnly: TEST_WORKSPACE.regionalModelsOnly,
        region: TEST_REGION,
      })
    ).toBe(true);
  });

  it("should return true when both plansWithAdvancedModels and featureFlag are set, with featureFlag enabled", () => {
    const model = createMockModel({
      availableIfOneOf: {
        plansWithAdvancedModels: true,
        featureFlag: "deepseek_feature",
      },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(
      isModelAvailable(model, {
        featureFlags: ["deepseek_feature"],
        plan,
        regionalModelsOnly: TEST_WORKSPACE.regionalModelsOnly,
        region: TEST_REGION,
      })
    ).toBe(true);
  });

  it("should return false when both plansWithAdvancedModels and featureFlag are set but neither condition is met", () => {
    const model = createMockModel({
      availableIfOneOf: {
        plansWithAdvancedModels: true,
        featureFlag: "deepseek_feature",
      },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(
      isModelAvailable(model, {
        featureFlags: [],
        plan,
        regionalModelsOnly: TEST_WORKSPACE.regionalModelsOnly,
        region: TEST_REGION,
      })
    ).toBe(false);
  });
});

describe("isModelReleased", () => {
  it("should return true for a model with no availability restriction", () => {
    const model = createMockModel({ availableIfOneOf: undefined });

    expect(isModelReleased(model)).toBe(true);
  });

  it("should return false for a model gated behind a feature flag", () => {
    const model = createMockModel({
      availableIfOneOf: { featureFlag: "deepseek_feature" },
    });

    expect(isModelReleased(model)).toBe(false);
  });
});

describe("filterEnabledModels", () => {
  it("excludes advanced models when the plan lacks advanced model access", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const model = createMockModel({
      availableIfOneOf: { plansWithAdvancedModels: true },
      largeModel: false,
      providerId: "anthropic",
    });

    const result = filterEnabledModels([model], {
      featureFlags: [],
      plan: { ...auth.plan()!, hasAdvancedModelAccess: false },
      regionalModelsOnly: auth.getNonNullableWorkspace().regionalModelsOnly,
      region: TEST_REGION,
      whitelistedProviders: getWhitelistedProviders(
        auth,
        await getEffectiveWhiteListedProviders(auth)
      ),
    });

    expect(result).toEqual([]);
  });

  it("should include model when available and provider is whitelisted", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const model = createMockModel({ providerId: "openai", largeModel: false });

    const result = filterEnabledModels([model], {
      featureFlags: [],
      plan: auth.plan(),
      regionalModelsOnly: auth.getNonNullableWorkspace().regionalModelsOnly,
      region: TEST_REGION,
      whitelistedProviders: getWhitelistedProviders(
        auth,
        await getEffectiveWhiteListedProviders(auth)
      ),
    });
    expect(result).toContain(model);
  });

  it("should exclude model when provider is not whitelisted", async () => {
    const workspace = await WorkspaceFactory.basic({
      whiteListedProviders: ["openai", "anthropic"],
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const model = createMockModel({
      providerId: "deepseek",
      largeModel: false,
    });

    const result = filterEnabledModels([model], {
      featureFlags: [],
      plan: auth.plan(),
      regionalModelsOnly: auth.getNonNullableWorkspace().regionalModelsOnly,
      region: TEST_REGION,
      whitelistedProviders: getWhitelistedProviders(
        auth,
        await getEffectiveWhiteListedProviders(auth)
      ),
    });
    expect(result).toHaveLength(0);
  });

  it("should exclude model when not available even if provider is whitelisted", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const model = createMockModel({
      providerId: "openai",
      availableIfOneOf: { featureFlag: "deepseek_feature" },
      largeModel: false,
    });

    const result = filterEnabledModels([model], {
      featureFlags: [],
      plan: auth.plan(),
      regionalModelsOnly: auth.getNonNullableWorkspace().regionalModelsOnly,
      region: TEST_REGION,
      whitelistedProviders: getWhitelistedProviders(
        auth,
        await getEffectiveWhiteListedProviders(auth)
      ),
    });
    expect(result).toHaveLength(0);
  });

  it("should include model when required featureFlag is enabled", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const model = createMockModel({
      providerId: "openai",
      availableIfOneOf: { featureFlag: "deepseek_feature" },
      largeModel: false,
    });

    const result = filterEnabledModels([model], {
      featureFlags: ["deepseek_feature"],
      plan: auth.plan(),
      regionalModelsOnly: auth.getNonNullableWorkspace().regionalModelsOnly,
      region: TEST_REGION,
      whitelistedProviders: getWhitelistedProviders(
        auth,
        await getEffectiveWhiteListedProviders(auth)
      ),
    });
    expect(result).toContain(model);
  });

  it("should filter correctly across multiple models", async () => {
    const workspace = await WorkspaceFactory.basic({
      whiteListedProviders: ["openai"],
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const openaiModel = createMockModel({
      providerId: "openai",
      largeModel: false,
    });
    const xaiModel = createMockModel({
      providerId: "xai",
      largeModel: false,
    });

    const result = filterEnabledModels([openaiModel, xaiModel], {
      featureFlags: [],
      plan: auth.plan(),
      regionalModelsOnly: auth.getNonNullableWorkspace().regionalModelsOnly,
      region: TEST_REGION,
      whitelistedProviders: getWhitelistedProviders(
        auth,
        await getEffectiveWhiteListedProviders(auth)
      ),
    });
    expect(result).toEqual([openaiModel]);
  });

  it("should include all providers when whiteListedProviders is null", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const model = createMockModel({
      providerId: "fireworks",
      largeModel: false,
    });

    const result = filterEnabledModels([model], {
      featureFlags: [],
      plan: auth.plan(),
      regionalModelsOnly: auth.getNonNullableWorkspace().regionalModelsOnly,
      region: TEST_REGION,
      whitelistedProviders: getWhitelistedProviders(
        auth,
        await getEffectiveWhiteListedProviders(auth)
      ),
    });
    expect(result).toContain(model);
  });
});
