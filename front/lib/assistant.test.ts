import { getWhitelistedProviders } from "@app/lib/api/assistant/models";
import {
  filterEnabledModels,
  isModelAvailable,
  isModelReleased,
} from "@app/lib/assistant";
import { Authenticator } from "@app/lib/auth";
import {
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
  FREE_NO_PLAN_CODE,
  FREE_UPGRADED_PLAN_CODE,
  PRO_PLAN_SEAT_29_CODE,
} from "@app/lib/plans/plan_codes";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import {
  CLAUDE_FABLE_5_DEFAULT_MODEL_CONFIG,
  CLAUDE_OPUS_5_DEFAULT_MODEL_CONFIG,
} from "@app/types/assistant/models/anthropic";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import {
  GPT_5_6_LUNA_MODEL_CONFIG,
  GPT_5_6_SOL_MODEL_CONFIG,
  GPT_5_6_TERRA_MODEL_CONFIG,
} from "@app/types/assistant/models/openai";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { PlanType } from "@app/types/plan";
import type { RegionType } from "@app/types/region";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { WorkspaceType } from "@app/types/user";
import { describe, expect, it } from "vitest";

const TEST_REGION: RegionType = "us-central1";

function createMockModel(
  overrides: Partial<ModelConfigurationType>
): ModelConfigurationType {
  const baseModel = SUPPORTED_MODEL_CONFIGS[0];
  return {
    ...baseModel,
    ...overrides,
  };
}

// createMockPlan is only used by isModelAvailable tests (pure sync, no factory available).
function createMockPlan(
  code: string,
  { hasAdvancedModelAccess = false }: { hasAdvancedModelAccess?: boolean } = {}
): PlanType {
  return {
    code,
    name: `Test Plan ${code}`,
    trialPeriodDays: 0,
    limits: {
      assistant: {
        isSlackBotAllowed: false,
        maxMessages: 1000,
        maxMessagesTimeframe: "day",
        maxAwuCredits: 1000,
        maxAwuCreditsTimeframe: "day",
        isDeepDiveAllowed: false,
      },
      connections: {
        count: -1,
        isConfluenceAllowed: false,
        isSlackAllowed: false,
        isNotionAllowed: false,
        isGoogleDriveAllowed: false,
        isGithubAllowed: false,
        isIntercomAllowed: false,
        isWebCrawlerAllowed: false,
        isSalesforceAllowed: false,
      },
      dataSources: {
        count: 10,
        documents: {
          count: 1000,
          sizeMb: 100,
        },
      },
      capabilities: {
        images: {
          maxImagesPerWeek: 10,
        },
      },
      users: {
        maxUsers: 10,
        maxFreeUsers: -1,
        maxLifetimeFreeUsers: -1,
        isSSOAllowed: false,
        isSCIMAllowed: false,
      },
      vaults: {
        maxVaults: 10,
      },
      canUseProduct: true,
    },
    isByok: false,
    isAuditLogsAllowed: false,
    hasAdvancedModelAccess,
  };
}

describe("isModelAvailable", () => {
  const owner: WorkspaceType = LightWorkspaceFactory.build();

  it("should return true for a basic model without restrictions", () => {
    const model = createMockModel({ largeModel: false });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(
      isModelAvailable(model, {
        featureFlags: [],
        plan,
        regionalModelsOnly: owner.regionalModelsOnly,
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
        regionalModelsOnly: owner.regionalModelsOnly,
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
        regionalModelsOnly: owner.regionalModelsOnly,
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
        regionalModelsOnly: owner.regionalModelsOnly,
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
        regionalModelsOnly: owner.regionalModelsOnly,
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
        regionalModelsOnly: owner.regionalModelsOnly,
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
        regionalModelsOnly: owner.regionalModelsOnly,
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
        regionalModelsOnly: owner.regionalModelsOnly,
        region: TEST_REGION,
      })
    ).toBe(false);
  });

  describe("GPT 5.6 Sol availability", () => {
    function isSolAvailable(
      plan: PlanType,
      featureFlags: WhitelistableFeature[] = []
    ) {
      return isModelAvailable(GPT_5_6_SOL_MODEL_CONFIG, {
        featureFlags,
        plan,
        regionalModelsOnly: owner.regionalModelsOnly,
        region: TEST_REGION,
      });
    }

    it("should be configured as a large model", () => {
      expect(GPT_5_6_SOL_MODEL_CONFIG.largeModel).toBe(true);
    });

    it("should be available on credit-priced plans", () => {
      expect(
        isSolAvailable(createMockPlan(CREDIT_PRICED_BUSINESS_PLAN_CODE))
      ).toBe(true);
    });

    it("should be available when the plan has advanced model access", () => {
      const plan = createMockPlan(FREE_NO_PLAN_CODE, {
        hasAdvancedModelAccess: true,
      });

      expect(isSolAvailable(plan)).toBe(true);
    });

    it("should be available with the Opus feature flag", () => {
      const plan = createMockPlan(FREE_NO_PLAN_CODE);

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
        regionalModelsOnly: owner.regionalModelsOnly,
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
        regionalModelsOnly: owner.regionalModelsOnly,
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
        regionalModelsOnly: owner.regionalModelsOnly,
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
        regionalModelsOnly: owner.regionalModelsOnly,
        region: TEST_REGION,
      })
    ).toBe(false);
  });

  it("should return true for advanced models when models_picker is enabled without plan access", () => {
    const model = createMockModel({
      availableIfOneOf: { plansWithAdvancedModels: true },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE, {
      hasAdvancedModelAccess: false,
    });

    expect(
      isModelAvailable(model, {
        featureFlags: ["models_picker"],
        plan,
        regionalModelsOnly: owner.regionalModelsOnly,
        region: TEST_REGION,
      })
    ).toBe(true);
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
        regionalModelsOnly: owner.regionalModelsOnly,
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
        regionalModelsOnly: owner.regionalModelsOnly,
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
        regionalModelsOnly: owner.regionalModelsOnly,
        region: TEST_REGION,
      })
    ).toBe(false);
  });
});

type ModelAccessCategory =
  | "standardNonLarge"
  | "standardLarge"
  | "featureGatedNonLarge"
  | "featureGatedLarge"
  | "advancedNonLarge"
  | "opus"
  | "sol";

type WorkspaceAccessExpectations = Record<ModelAccessCategory, boolean>;

type WorkspaceAccessCase = {
  name: string;
  plan: PlanType | null;
  withModelFeatureFlag?: boolean;
  withModelsPicker?: boolean;
  expected: WorkspaceAccessExpectations;
};

const MODEL_ACCESS_CATEGORIES: Array<{
  id: ModelAccessCategory;
  name: string;
  model: ModelConfigurationType;
}> = [
  {
    id: "standardNonLarge",
    name: "standard non-large model",
    model: GPT_5_6_LUNA_MODEL_CONFIG,
  },
  {
    id: "standardLarge",
    name: "standard large model",
    model: GPT_5_6_TERRA_MODEL_CONFIG,
  },
  {
    id: "featureGatedNonLarge",
    name: "feature-gated non-large model",
    model: createMockModel({
      availableIfOneOf: { featureFlag: "deepseek_feature" },
      largeModel: false,
    }),
  },
  {
    id: "featureGatedLarge",
    name: "feature-gated large model",
    model: CLAUDE_FABLE_5_DEFAULT_MODEL_CONFIG,
  },
  {
    id: "advancedNonLarge",
    name: "advanced non-large model",
    model: createMockModel({
      availableIfOneOf: {
        plansWithAdvancedModels: true,
        featureFlag: "deepseek_feature",
      },
      largeModel: false,
    }),
  },
  {
    id: "opus",
    name: "Opus",
    model: CLAUDE_OPUS_5_DEFAULT_MODEL_CONFIG,
  },
  {
    id: "sol",
    name: "GPT 5.6 Sol",
    model: GPT_5_6_SOL_MODEL_CONFIG,
  },
];

// These cases isolate workspace access rules. Provider whitelisting, BYOK,
// and regional availability are independent constraints covered elsewhere.
const WORKSPACE_ACCESS_CASES: WorkspaceAccessCase[] = [
  {
    name: "workspace without a plan",
    plan: null,
    expected: {
      standardNonLarge: true,
      standardLarge: false,
      featureGatedNonLarge: false,
      featureGatedLarge: false,
      advancedNonLarge: false,
      opus: false,
      sol: false,
    },
  },
  {
    name: "workspace without a plan and with the model feature flag",
    plan: null,
    withModelFeatureFlag: true,
    expected: {
      standardNonLarge: true,
      standardLarge: false,
      featureGatedNonLarge: true,
      featureGatedLarge: false,
      advancedNonLarge: true,
      opus: false,
      sol: true,
    },
  },
  {
    name: "workspace without a plan and with models_picker",
    plan: null,
    withModelsPicker: true,
    expected: {
      standardNonLarge: true,
      standardLarge: false,
      featureGatedNonLarge: false,
      featureGatedLarge: false,
      advancedNonLarge: true,
      opus: true,
      sol: true,
    },
  },
  {
    name: "free workspace without an entitlement",
    plan: createMockPlan(FREE_NO_PLAN_CODE),
    expected: {
      standardNonLarge: true,
      standardLarge: false,
      featureGatedNonLarge: false,
      featureGatedLarge: false,
      advancedNonLarge: false,
      opus: false,
      sol: false,
    },
  },
  {
    name: "free workspace with the model feature flag",
    plan: createMockPlan(FREE_NO_PLAN_CODE),
    withModelFeatureFlag: true,
    expected: {
      standardNonLarge: true,
      standardLarge: false,
      featureGatedNonLarge: true,
      featureGatedLarge: false,
      advancedNonLarge: true,
      opus: false,
      sol: true,
    },
  },
  {
    name: "free workspace with advanced-model plan access",
    plan: createMockPlan(FREE_NO_PLAN_CODE, {
      hasAdvancedModelAccess: true,
    }),
    expected: {
      standardNonLarge: true,
      standardLarge: false,
      featureGatedNonLarge: false,
      featureGatedLarge: false,
      advancedNonLarge: true,
      opus: false,
      sol: true,
    },
  },
  {
    name: "free workspace with models_picker",
    plan: createMockPlan(FREE_NO_PLAN_CODE),
    withModelsPicker: true,
    expected: {
      standardNonLarge: true,
      standardLarge: false,
      featureGatedNonLarge: false,
      featureGatedLarge: false,
      advancedNonLarge: true,
      opus: true,
      sol: true,
    },
  },
  {
    name: "free-upgraded workspace without an entitlement",
    plan: createMockPlan(FREE_UPGRADED_PLAN_CODE),
    expected: {
      standardNonLarge: true,
      standardLarge: true,
      featureGatedNonLarge: false,
      featureGatedLarge: false,
      advancedNonLarge: false,
      opus: false,
      sol: false,
    },
  },
  {
    name: "free-upgraded workspace with the model feature flag",
    plan: createMockPlan(FREE_UPGRADED_PLAN_CODE),
    withModelFeatureFlag: true,
    expected: {
      standardNonLarge: true,
      standardLarge: true,
      featureGatedNonLarge: true,
      featureGatedLarge: true,
      advancedNonLarge: true,
      opus: true,
      sol: true,
    },
  },
  {
    name: "free-upgraded workspace with advanced-model plan access",
    plan: createMockPlan(FREE_UPGRADED_PLAN_CODE, {
      hasAdvancedModelAccess: true,
    }),
    expected: {
      standardNonLarge: true,
      standardLarge: true,
      featureGatedNonLarge: false,
      featureGatedLarge: false,
      advancedNonLarge: true,
      opus: true,
      sol: true,
    },
  },
  {
    name: "free-upgraded workspace with models_picker",
    plan: createMockPlan(FREE_UPGRADED_PLAN_CODE),
    withModelsPicker: true,
    expected: {
      standardNonLarge: true,
      standardLarge: true,
      featureGatedNonLarge: false,
      featureGatedLarge: false,
      advancedNonLarge: true,
      opus: true,
      sol: true,
    },
  },
  {
    name: "legacy paid workspace without an entitlement",
    plan: createMockPlan(PRO_PLAN_SEAT_29_CODE),
    expected: {
      standardNonLarge: true,
      standardLarge: true,
      featureGatedNonLarge: false,
      featureGatedLarge: false,
      advancedNonLarge: false,
      opus: false,
      sol: false,
    },
  },
  {
    name: "legacy paid workspace with the model feature flag",
    plan: createMockPlan(PRO_PLAN_SEAT_29_CODE),
    withModelFeatureFlag: true,
    expected: {
      standardNonLarge: true,
      standardLarge: true,
      featureGatedNonLarge: true,
      featureGatedLarge: true,
      advancedNonLarge: true,
      opus: true,
      sol: true,
    },
  },
  {
    name: "legacy paid workspace with advanced-model plan access",
    plan: createMockPlan(PRO_PLAN_SEAT_29_CODE, {
      hasAdvancedModelAccess: true,
    }),
    expected: {
      standardNonLarge: true,
      standardLarge: true,
      featureGatedNonLarge: false,
      featureGatedLarge: false,
      advancedNonLarge: true,
      opus: true,
      sol: true,
    },
  },
  {
    name: "legacy paid workspace with models_picker",
    plan: createMockPlan(PRO_PLAN_SEAT_29_CODE),
    withModelsPicker: true,
    expected: {
      standardNonLarge: true,
      standardLarge: true,
      featureGatedNonLarge: false,
      featureGatedLarge: false,
      advancedNonLarge: true,
      opus: true,
      sol: true,
    },
  },
  {
    name: "credit-priced workspace without an entitlement",
    plan: createMockPlan(CREDIT_PRICED_BUSINESS_PLAN_CODE),
    expected: {
      standardNonLarge: true,
      standardLarge: true,
      featureGatedNonLarge: false,
      featureGatedLarge: false,
      advancedNonLarge: false,
      opus: false,
      sol: true,
    },
  },
  {
    name: "credit-priced workspace with the model feature flag",
    plan: createMockPlan(CREDIT_PRICED_BUSINESS_PLAN_CODE),
    withModelFeatureFlag: true,
    expected: {
      standardNonLarge: true,
      standardLarge: true,
      featureGatedNonLarge: true,
      featureGatedLarge: true,
      advancedNonLarge: true,
      opus: true,
      sol: true,
    },
  },
  {
    name: "credit-priced workspace with advanced-model plan access",
    plan: createMockPlan(CREDIT_PRICED_BUSINESS_PLAN_CODE, {
      hasAdvancedModelAccess: true,
    }),
    expected: {
      standardNonLarge: true,
      standardLarge: true,
      featureGatedNonLarge: false,
      featureGatedLarge: false,
      advancedNonLarge: true,
      opus: true,
      sol: true,
    },
  },
  {
    name: "credit-priced workspace with models_picker",
    plan: createMockPlan(CREDIT_PRICED_BUSINESS_PLAN_CODE),
    withModelsPicker: true,
    expected: {
      standardNonLarge: true,
      standardLarge: true,
      featureGatedNonLarge: false,
      featureGatedLarge: false,
      advancedNonLarge: true,
      opus: true,
      sol: true,
    },
  },
];

function getFeatureFlagsForAccessCase(
  model: ModelConfigurationType,
  accessCase: WorkspaceAccessCase
): WhitelistableFeature[] {
  const featureFlags: WhitelistableFeature[] = [];

  if (accessCase.withModelFeatureFlag) {
    const featureFlag = model.availableIfOneOf?.featureFlag;
    if (featureFlag) {
      featureFlags.push(featureFlag);
    }
  }

  if (accessCase.withModelsPicker) {
    featureFlags.push("models_picker");
  }

  return featureFlags;
}

describe("isModelAvailable model access matrix", () => {
  for (const category of MODEL_ACCESS_CATEGORIES) {
    describe(category.name, () => {
      for (const accessCase of WORKSPACE_ACCESS_CASES) {
        const expected = accessCase.expected[category.id];

        it(`${accessCase.name} ${expected ? "has" : "does not have"} access`, () => {
          expect(
            isModelAvailable(category.model, {
              featureFlags: getFeatureFlagsForAccessCase(
                category.model,
                accessCase
              ),
              plan: accessCase.plan,
              regionalModelsOnly: false,
              region: TEST_REGION,
            })
          ).toBe(expected);
        });
      }
    });
  }
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
  it("includes advanced models when models_picker is enabled without plan access", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const model = createMockModel({
      availableIfOneOf: { plansWithAdvancedModels: true },
      largeModel: false,
      providerId: "anthropic",
    });

    const result = filterEnabledModels([model], {
      featureFlags: ["models_picker"],
      plan: { ...auth.plan()!, hasAdvancedModelAccess: false },
      regionalModelsOnly: auth.getNonNullableWorkspace().regionalModelsOnly,
      region: TEST_REGION,
      whitelistedProviders: getWhitelistedProviders(auth),
    });

    expect(result).toEqual([model]);
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
      whitelistedProviders: getWhitelistedProviders(auth),
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
      whitelistedProviders: getWhitelistedProviders(auth),
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
      whitelistedProviders: getWhitelistedProviders(auth),
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
      whitelistedProviders: getWhitelistedProviders(auth),
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
      whitelistedProviders: getWhitelistedProviders(auth),
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
      whitelistedProviders: getWhitelistedProviders(auth),
    });
    expect(result).toContain(model);
  });
});
