import { getWhitelistedProviders } from "@app/lib/api/assistant/models";
import type { RegionType } from "@app/lib/api/regions/config";
import {
  filterCustomAvailableAndWhitelistedModels,
  isModelCustomAvailable,
} from "@app/lib/assistant";
import { Authenticator } from "@app/lib/auth";
import {
  DUST_COMPANY_PLAN_CODE,
  FREE_NO_PLAN_CODE,
  FREE_UPGRADED_PLAN_CODE,
  PRO_PLAN_SEAT_29_CODE,
} from "@app/lib/plans/plan_codes";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { PlanType } from "@app/types/plan";
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

// createMockPlan is only used by isModelCustomAvailable tests (pure sync, no factory available).
function createMockPlan(code: string): PlanType {
  return {
    code,
    name: `Test Plan ${code}`,
    trialPeriodDays: 0,
    limits: {
      assistant: {
        isSlackBotAllowed: false,
        maxMessages: 1000,
        maxMessagesTimeframe: "day",
        isDeepDiveAllowed: false,
      },
      connections: {
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
  };
}

describe("isModelCustomAvailable", () => {
  const owner: WorkspaceType = LightWorkspaceFactory.build();

  it("should return true for a basic model without restrictions", () => {
    const model = createMockModel({ largeModel: false });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(
      isModelCustomAvailable(model, {
        featureFlags: [],
        plan,
        owner,
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
      isModelCustomAvailable(model, {
        featureFlags: ["deepseek_feature"],
        plan,
        owner,
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
      isModelCustomAvailable(model, {
        featureFlags: [],
        plan,
        owner,
        region: TEST_REGION,
      })
    ).toBe(false);
  });

  it("should return true when customAssistantFeatureFlag is enabled", () => {
    const model = createMockModel({
      customAvailableIf: { featureFlag: "openai_o1_feature" },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(
      isModelCustomAvailable(model, {
        featureFlags: ["openai_o1_feature"],
        plan,
        owner,
        region: TEST_REGION,
      })
    ).toBe(true);
  });

  it("should return false when customAssistantFeatureFlag is not enabled", () => {
    const model = createMockModel({
      customAvailableIf: { featureFlag: "openai_o1_feature" },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(
      isModelCustomAvailable(model, {
        featureFlags: [],
        plan,
        owner,
        region: TEST_REGION,
      })
    ).toBe(false);
  });

  it("should return true for large model with upgraded plan", () => {
    const model = createMockModel({ largeModel: true });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(
      isModelCustomAvailable(model, {
        featureFlags: [],
        plan,
        owner,
        region: TEST_REGION,
      })
    ).toBe(true);
  });

  it("should return true for large model with free upgraded plan", () => {
    const model = createMockModel({ largeModel: true });
    const plan = createMockPlan(FREE_UPGRADED_PLAN_CODE);

    expect(
      isModelCustomAvailable(model, {
        featureFlags: [],
        plan,
        owner,
        region: TEST_REGION,
      })
    ).toBe(true);
  });

  it("should return false for large model without upgraded plan", () => {
    const model = createMockModel({
      largeModel: true,
      availableIfOneOf: { enterprise: true },
    });
    const plan = createMockPlan(FREE_NO_PLAN_CODE);

    expect(
      isModelCustomAvailable(model, {
        featureFlags: [],
        plan,
        owner,
        region: TEST_REGION,
      })
    ).toBe(false);
  });

  it("should return false for large model with null plan", () => {
    const model = createMockModel({
      largeModel: true,
      availableIfOneOf: { enterprise: true },
    });

    expect(
      isModelCustomAvailable(model, {
        featureFlags: [],
        plan: null,
        owner,
        region: TEST_REGION,
      })
    ).toBe(false);
  });

  it("should return false when both featureFlag and customAssistantFeatureFlag are required but only one is enabled", () => {
    const model = createMockModel({
      availableIfOneOf: { featureFlag: "deepseek_feature" },
      customAvailableIf: { featureFlag: "openai_o1_feature" },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(
      isModelCustomAvailable(model, {
        featureFlags: ["deepseek_feature"],
        plan,
        owner,
        region: TEST_REGION,
      })
    ).toBe(false);
  });

  it("should return true when both featureFlag and customAssistantFeatureFlag are required and both are enabled", () => {
    const model = createMockModel({
      availableIfOneOf: { featureFlag: "deepseek_feature" },
      customAvailableIf: { featureFlag: "openai_o1_feature" },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(
      isModelCustomAvailable(model, {
        featureFlags: ["deepseek_feature", "openai_o1_feature"],
        plan,
        owner,
        region: TEST_REGION,
      })
    ).toBe(true);
  });

  it("should return false when large model requires upgraded plan but featureFlag is missing", () => {
    const model = createMockModel({
      availableIfOneOf: { featureFlag: "deepseek_feature" },
      largeModel: true,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(
      isModelCustomAvailable(model, {
        featureFlags: [],
        plan,
        owner,
        region: TEST_REGION,
      })
    ).toBe(false);
  });

  it("should return true when enterprise is set and plan is an enterprise plan", () => {
    const model = createMockModel({
      availableIfOneOf: { enterprise: true },
      largeModel: false,
    });
    const plan = createMockPlan(DUST_COMPANY_PLAN_CODE);

    expect(
      isModelCustomAvailable(model, {
        featureFlags: [],
        plan,
        owner,
        region: TEST_REGION,
      })
    ).toBe(true);
  });

  it("should return true when enterprise is set and plan has ENT_ prefix", () => {
    const model = createMockModel({
      availableIfOneOf: { enterprise: true },
      largeModel: false,
    });
    const plan = createMockPlan("ENT_CUSTOM_PLAN");

    expect(
      isModelCustomAvailable(model, {
        featureFlags: [],
        plan,
        owner,
        region: TEST_REGION,
      })
    ).toBe(true);
  });

  it("should return true when both enterprise and featureFlag are set, with enterprise plan", () => {
    const model = createMockModel({
      availableIfOneOf: { enterprise: true, featureFlag: "deepseek_feature" },
      largeModel: false,
    });
    const plan = createMockPlan(DUST_COMPANY_PLAN_CODE);

    expect(
      isModelCustomAvailable(model, {
        featureFlags: [],
        plan,
        owner,
        region: TEST_REGION,
      })
    ).toBe(true);
  });

  it("should return true when both enterprise and featureFlag are set, with featureFlag enabled", () => {
    const model = createMockModel({
      availableIfOneOf: { enterprise: true, featureFlag: "deepseek_feature" },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(
      isModelCustomAvailable(model, {
        featureFlags: ["deepseek_feature"],
        plan,
        owner,
        region: TEST_REGION,
      })
    ).toBe(true);
  });

  it("should return false when both enterprise and featureFlag are set but neither condition is met", () => {
    const model = createMockModel({
      availableIfOneOf: { enterprise: true, featureFlag: "deepseek_feature" },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(
      isModelCustomAvailable(model, {
        featureFlags: [],
        plan,
        owner,
        region: TEST_REGION,
      })
    ).toBe(false);
  });
});

describe("filterCustomAvailableAndWhitelistedModels", () => {
  it("should include model when available and provider is whitelisted", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const model = createMockModel({ providerId: "openai", largeModel: false });

    const result = filterCustomAvailableAndWhitelistedModels([model], {
      featureFlags: [],
      plan: auth.plan(),
      owner: auth.getNonNullableWorkspace(),
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

    const result = filterCustomAvailableAndWhitelistedModels([model], {
      featureFlags: [],
      plan: auth.plan(),
      owner: auth.getNonNullableWorkspace(),
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

    const result = filterCustomAvailableAndWhitelistedModels([model], {
      featureFlags: [],
      plan: auth.plan(),
      owner: auth.getNonNullableWorkspace(),
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

    const result = filterCustomAvailableAndWhitelistedModels([model], {
      featureFlags: ["deepseek_feature"],
      plan: auth.plan(),
      owner: auth.getNonNullableWorkspace(),
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

    const result = filterCustomAvailableAndWhitelistedModels(
      [openaiModel, xaiModel],
      {
        featureFlags: [],
        plan: auth.plan(),
        owner: auth.getNonNullableWorkspace(),
        region: TEST_REGION,
        whitelistedProviders: getWhitelistedProviders(auth),
      }
    );
    expect(result).toEqual([openaiModel]);
  });

  it("should include all providers when whiteListedProviders is null", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const model = createMockModel({
      providerId: "togetherai",
      largeModel: false,
    });

    const result = filterCustomAvailableAndWhitelistedModels([model], {
      featureFlags: [],
      plan: auth.plan(),
      owner: auth.getNonNullableWorkspace(),
      region: TEST_REGION,
      whitelistedProviders: getWhitelistedProviders(auth),
    });
    expect(result).toContain(model);
  });
});
