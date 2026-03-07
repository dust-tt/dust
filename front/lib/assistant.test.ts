import {
  isModelCustomAvailable,
  isModelCustomAvailableAndWhitelisted,
} from "@app/lib/assistant";
import {
  DUST_COMPANY_PLAN_CODE,
  FREE_NO_PLAN_CODE,
  FREE_UPGRADED_PLAN_CODE,
  PRO_PLAN_SEAT_29_CODE,
} from "@app/lib/plans/plan_codes";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { PlanType } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

// Helper to create a mock model configuration
function createMockModel(
  overrides: Partial<ModelConfigurationType>
): ModelConfigurationType {
  const baseModel = SUPPORTED_MODEL_CONFIGS[0]; // Use a real model as base
  return {
    ...baseModel,
    ...overrides,
  };
}

// Helper to create a mock plan
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
        isSSOAllowed: false,
        isSCIMAllowed: false,
      },
      vaults: {
        maxVaults: 10,
      },
      canUseProduct: true,
    },
    isByok: false,
  };
}

describe("isModelCustomAvailable", () => {
  it("should return true for a basic model without restrictions", () => {
    const model = createMockModel({
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, featureFlags, plan)).toBe(true);
  });

  it("should return true when featureFlag is enabled", () => {
    const model = createMockModel({
      availableIfUnion: { featureFlag: "deepseek_feature" },
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = ["deepseek_feature"];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, featureFlags, plan)).toBe(true);
  });

  it("should return false when featureFlag is not enabled", () => {
    const model = createMockModel({
      availableIfUnion: { featureFlag: "deepseek_feature" },
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, featureFlags, plan)).toBe(false);
  });

  it("should return true when customAssistantFeatureFlag is enabled", () => {
    const model = createMockModel({
      customAvailableIf: { featureFlag: "openai_o1_feature" },
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = ["openai_o1_feature"];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, featureFlags, plan)).toBe(true);
  });

  it("should return false when customAssistantFeatureFlag is not enabled", () => {
    const model = createMockModel({
      customAvailableIf: { featureFlag: "openai_o1_feature" },
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, featureFlags, plan)).toBe(false);
  });

  it("should return true for large model with upgraded plan", () => {
    const model = createMockModel({
      largeModel: true,
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, featureFlags, plan)).toBe(true);
  });

  it("should return true for large model with free upgraded plan", () => {
    const model = createMockModel({
      largeModel: true,
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = createMockPlan(FREE_UPGRADED_PLAN_CODE);

    expect(isModelCustomAvailable(model, featureFlags, plan)).toBe(true);
  });

  it("should return false for large model without upgraded plan", () => {
    const model = createMockModel({
      largeModel: true,
      availableIfUnion: { enterprise: true },
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = createMockPlan(FREE_NO_PLAN_CODE);

    expect(isModelCustomAvailable(model, featureFlags, plan)).toBe(false);
  });

  it("should return false for large model with null plan", () => {
    const model = createMockModel({
      largeModel: true,
      availableIfUnion: { enterprise: true },
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = null;

    expect(isModelCustomAvailable(model, featureFlags, plan)).toBe(false);
  });

  it("should return false when both featureFlag and customAssistantFeatureFlag are required but only one is enabled", () => {
    const model = createMockModel({
      availableIfUnion: { featureFlag: "deepseek_feature" },
      customAvailableIf: { featureFlag: "openai_o1_feature" },
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = ["deepseek_feature"];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, featureFlags, plan)).toBe(false);
  });

  it("should return true when both featureFlag and customAssistantFeatureFlag are required and both are enabled", () => {
    const model = createMockModel({
      availableIfUnion: { featureFlag: "deepseek_feature" },
      customAvailableIf: { featureFlag: "openai_o1_feature" },
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [
      "deepseek_feature",
      "openai_o1_feature",
    ];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, featureFlags, plan)).toBe(true);
  });

  it("should return false when large model requires upgraded plan but featureFlag is missing", () => {
    const model = createMockModel({
      availableIfUnion: { featureFlag: "deepseek_feature" },
      largeModel: true,
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, featureFlags, plan)).toBe(false);
  });

  // enterprise availability tests
  it("should return true when enterprise is set and plan is an enterprise plan", () => {
    const model = createMockModel({
      availableIfUnion: { enterprise: true },
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = createMockPlan(DUST_COMPANY_PLAN_CODE);

    expect(isModelCustomAvailable(model, featureFlags, plan)).toBe(true);
  });

  it("should return true when enterprise is set and plan has ENT_ prefix", () => {
    const model = createMockModel({
      availableIfUnion: { enterprise: true },
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = createMockPlan("ENT_CUSTOM_PLAN");

    expect(isModelCustomAvailable(model, featureFlags, plan)).toBe(true);
  });

  it("should return true when both enterprise and featureFlag are set, with enterprise plan (no featureFlag needed)", () => {
    const model = createMockModel({
      availableIfUnion: { enterprise: true, featureFlag: "deepseek_feature" },
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = createMockPlan(DUST_COMPANY_PLAN_CODE);

    expect(isModelCustomAvailable(model, featureFlags, plan)).toBe(true);
  });

  it("should return true when both enterprise and featureFlag are set, with featureFlag enabled (no enterprise plan needed)", () => {
    const model = createMockModel({
      availableIfUnion: { enterprise: true, featureFlag: "deepseek_feature" },
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = ["deepseek_feature"];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, featureFlags, plan)).toBe(true);
  });

  it("should return false when both enterprise and featureFlag are set but neither condition is met", () => {
    const model = createMockModel({
      availableIfUnion: { enterprise: true, featureFlag: "deepseek_feature" },
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, featureFlags, plan)).toBe(false);
  });
});

describe("isModelCustomAvailableAndWhitelisted", () => {
  let workspace: WorkspaceType;
  const upgradedPlan = createMockPlan(PRO_PLAN_SEAT_29_CODE);
  const nonUpgradedPlan = createMockPlan(FREE_NO_PLAN_CODE);

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
  });

  it("should return true when model is available and provider is whitelisted", async () => {
    const model = createMockModel({
      providerId: "openai",
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];

    // WorkspaceFactory.basic() creates a workspace with PRO_PLAN_SEAT_29_CODE which should have all providers whitelisted by default
    expect(
      isModelCustomAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        workspace
      )
    ).toBe(true);
  });

  it("should return false when model is available but provider is not whitelisted", async () => {
    const model = createMockModel({
      providerId: "deepseek",
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];

    // Create a workspace with restricted providers
    const restrictedWorkspace: WorkspaceType = {
      ...workspace,
      whiteListedProviders: ["openai", "anthropic"], // deepseek is not whitelisted
    };

    expect(
      isModelCustomAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        restrictedWorkspace
      )
    ).toBe(false);
  });

  it("should return false when model is not available even if provider is whitelisted", async () => {
    const model = createMockModel({
      providerId: "openai",
      availableIfUnion: { featureFlag: "deepseek_feature" },
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = []; // featureFlag not enabled

    expect(
      isModelCustomAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        workspace
      )
    ).toBe(false);
  });

  it("should return false when large model is not available due to plan", async () => {
    const model = createMockModel({
      providerId: "openai",
      largeModel: true,
      availableIfUnion: { enterprise: true },
    });
    const featureFlags: WhitelistableFeature[] = [];

    expect(
      isModelCustomAvailableAndWhitelisted(
        model,
        featureFlags,
        nonUpgradedPlan,
        workspace
      )
    ).toBe(false);
  });

  it("should return false when model requires featureFlag that is not enabled", async () => {
    const model = createMockModel({
      providerId: "openai",
      availableIfUnion: { featureFlag: "deepseek_feature" },
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = []; // featureFlag not enabled

    expect(
      isModelCustomAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        workspace
      )
    ).toBe(false);
  });

  it("should return true when model requires featureFlag that is enabled and provider is whitelisted", async () => {
    const model = createMockModel({
      providerId: "openai",
      availableIfUnion: { featureFlag: "deepseek_feature" },
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = ["deepseek_feature"];

    expect(
      isModelCustomAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        workspace
      )
    ).toBe(true);
  });

  it("should return true for large model with upgraded plan and whitelisted provider", async () => {
    const model = createMockModel({
      providerId: "anthropic",
      largeModel: true,
    });
    const featureFlags: WhitelistableFeature[] = [];

    expect(
      isModelCustomAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        workspace
      )
    ).toBe(true);
  });

  it("should return false when provider is not whitelisted even if model is available", async () => {
    const model = createMockModel({
      providerId: "xai",
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];

    // Create a workspace with only openai whitelisted
    const restrictedWorkspace: WorkspaceType = {
      ...workspace,
      whiteListedProviders: ["openai"],
    };

    expect(
      isModelCustomAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        restrictedWorkspace
      )
    ).toBe(false);
  });

  it("should return true when workspace has all providers whitelisted (default)", async () => {
    const model = createMockModel({
      providerId: "mistral",
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];

    // WorkspaceFactory.basic() should have all providers whitelisted by default
    expect(
      isModelCustomAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        workspace
      )
    ).toBe(true);
  });

  it("should return true when whiteListedProviders is null (defaults to all providers)", async () => {
    const model = createMockModel({
      providerId: "togetherai",
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];

    const workspaceWithNullProviders: WorkspaceType = {
      ...workspace,
      whiteListedProviders: null,
    };

    expect(
      isModelCustomAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        workspaceWithNullProviders
      )
    ).toBe(true);
  });

  it("should return false when model requires customAssistantFeatureFlag that is not enabled", async () => {
    const model = createMockModel({
      providerId: "openai",
      customAvailableIf: { featureFlag: "openai_o1_feature" },
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = []; // customAssistantFeatureFlag not enabled

    expect(
      isModelCustomAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        workspace
      )
    ).toBe(false);
  });

  it("should return true when model requires customAssistantFeatureFlag that is enabled and provider is whitelisted", async () => {
    const model = createMockModel({
      providerId: "openai",
      customAvailableIf: { featureFlag: "openai_o1_feature" },
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = ["openai_o1_feature"];

    expect(
      isModelCustomAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        workspace
      )
    ).toBe(true);
  });
});
