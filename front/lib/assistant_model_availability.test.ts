import { isModelAvailable } from "@app/lib/assistant";
import { FREE_NO_PLAN_DATA } from "@app/lib/plans/free_plans";
import {
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
  FREE_NO_PLAN_CODE,
  FREE_UPGRADED_PLAN_CODE,
  PRO_PLAN_SEAT_29_CODE,
} from "@app/lib/plans/plan_codes";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
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
import { describe, expect, it } from "vitest";

type ModelAccessCategory =
  | "standardNonLarge"
  | "standardLarge"
  | "featureGatedNonLarge"
  | "featureGatedLarge"
  | "advancedNonLarge"
  | "opus"
  | "sol";

type ModelAccessCategoryDefinition = {
  id: ModelAccessCategory;
  name: string;
  model: ModelConfigurationType;
};

type WorkspaceAccessExpectations = Record<ModelAccessCategory, boolean>;

type WorkspaceAccessCase = {
  name: string;
  plan: PlanType | null;
  withModelFeatureFlag?: boolean;
  expected: WorkspaceAccessExpectations;
};

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

const MODEL_ACCESS_CATEGORIES: ModelAccessCategoryDefinition[] = [
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

// We test a few cases for workspace that have different rules.
// Provider whitelisting, BYOK, and regional availability are not covered here, they are tested in assistant.test.ts.
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
      sol: false,
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
      sol: false,
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
      sol: false,
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
    name: "credit-priced workspace without an entitlement",
    plan: createMockPlan(CREDIT_PRICED_BUSINESS_PLAN_CODE),
    expected: {
      standardNonLarge: true,
      standardLarge: true,
      featureGatedNonLarge: false,
      featureGatedLarge: false,
      advancedNonLarge: false,
      opus: true,
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

  return featureFlags;
}

describe("model availability by workspace access", () => {
  // For each category of model we check against what category of workspace has access to.
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

describe("Fireworks model availability", () => {
  it("does not gate supported models behind feature flags", () => {
    const gatedModelIds = SUPPORTED_MODEL_CONFIGS.filter(
      (model) =>
        model.providerId === "fireworks" &&
        model.availableIfOneOf?.featureFlag !== undefined
    ).map((model) => model.modelId);

    expect(gatedModelIds).toEqual([]);
  });
});
