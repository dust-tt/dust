import {
  isModelAvailable,
  isModelAvailableAndWhitelisted,
} from "@app/lib/assistant";
import {
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
  };
}

describe("isModelAvailable", () => {
  it("should return true for a basic model without restrictions", () => {
    const model = createMockModel({
      featureFlag: undefined,
      customAssistantFeatureFlag: undefined,
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelAvailable(model, featureFlags, plan)).toBe(true);
  });

  it("should return true when featureFlag is enabled", () => {
    const model = createMockModel({
      featureFlag: "deepseek_feature",
      customAssistantFeatureFlag: undefined,
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = ["deepseek_feature"];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelAvailable(model, featureFlags, plan)).toBe(true);
  });

  it("should return false when featureFlag is not enabled", () => {
    const model = createMockModel({
      featureFlag: "deepseek_feature",
      customAssistantFeatureFlag: undefined,
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelAvailable(model, featureFlags, plan)).toBe(false);
  });

  it("should return true when customAssistantFeatureFlag is enabled", () => {
    const model = createMockModel({
      featureFlag: undefined,
      customAssistantFeatureFlag: "openai_o1_feature",
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = ["openai_o1_feature"];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelAvailable(model, featureFlags, plan)).toBe(true);
  });

  it("should return false when customAssistantFeatureFlag is not enabled", () => {
    const model = createMockModel({
      featureFlag: undefined,
      customAssistantFeatureFlag: "openai_o1_feature",
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelAvailable(model, featureFlags, plan)).toBe(false);
  });

  it("should return true for large model with upgraded plan", () => {
    const model = createMockModel({
      featureFlag: undefined,
      customAssistantFeatureFlag: undefined,
      largeModel: true,
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelAvailable(model, featureFlags, plan)).toBe(true);
  });

  it("should return true for large model with free upgraded plan", () => {
    const model = createMockModel({
      featureFlag: undefined,
      customAssistantFeatureFlag: undefined,
      largeModel: true,
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = createMockPlan(FREE_UPGRADED_PLAN_CODE);

    expect(isModelAvailable(model, featureFlags, plan)).toBe(true);
  });

  it("should return false for large model without upgraded plan", () => {
    const model = createMockModel({
      featureFlag: undefined,
      customAssistantFeatureFlag: undefined,
      largeModel: true,
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = createMockPlan(FREE_NO_PLAN_CODE);

    expect(isModelAvailable(model, featureFlags, plan)).toBe(false);
  });

  it("should return false for large model with null plan", () => {
    const model = createMockModel({
      featureFlag: undefined,
      customAssistantFeatureFlag: undefined,
      largeModel: true,
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = null;

    expect(isModelAvailable(model, featureFlags, plan)).toBe(false);
  });

  it("should return false when both featureFlag and customAssistantFeatureFlag are required but only one is enabled", () => {
    const model = createMockModel({
      featureFlag: "deepseek_feature",
      customAssistantFeatureFlag: "openai_o1_feature",
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = ["deepseek_feature"];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelAvailable(model, featureFlags, plan)).toBe(false);
  });

  it("should return true when both featureFlag and customAssistantFeatureFlag are required and both are enabled", () => {
    const model = createMockModel({
      featureFlag: "deepseek_feature",
      customAssistantFeatureFlag: "openai_o1_feature",
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [
      "deepseek_feature",
      "openai_o1_feature",
    ];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelAvailable(model, featureFlags, plan)).toBe(true);
  });

  it("should return false when large model requires upgraded plan but featureFlag is missing", () => {
    const model = createMockModel({
      featureFlag: "deepseek_feature",
      customAssistantFeatureFlag: undefined,
      largeModel: true,
    });
    const featureFlags: WhitelistableFeature[] = [];
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelAvailable(model, featureFlags, plan)).toBe(false);
  });
});

describe("isModelAvailableAndWhitelisted", () => {
  let workspace: WorkspaceType;
  const upgradedPlan = createMockPlan(PRO_PLAN_SEAT_29_CODE);
  const nonUpgradedPlan = createMockPlan(FREE_NO_PLAN_CODE);

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
  });

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  it("should return true when model is available and provider is whitelisted", async () => {
    const model = createMockModel({
      providerId: "openai",
      featureFlag: undefined,
      customAssistantFeatureFlag: undefined,
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];

    // WorkspaceFactory.basic() creates a workspace with PRO_PLAN_SEAT_29_CODE which should have all providers whitelisted by default
    expect(
      isModelAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        workspace
      )
    ).toBe(true);
  });

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  it("should return false when model is available but provider is not whitelisted", async () => {
    const model = createMockModel({
      providerId: "deepseek",
      featureFlag: undefined,
      customAssistantFeatureFlag: undefined,
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];

    // Create a workspace with restricted providers
    const restrictedWorkspace: WorkspaceType = {
      ...workspace,
      whiteListedProviders: ["openai", "anthropic"], // deepseek is not whitelisted
    };

    expect(
      isModelAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        restrictedWorkspace
      )
    ).toBe(false);
  });

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  it("should return false when model is not available even if provider is whitelisted", async () => {
    const model = createMockModel({
      providerId: "openai",
      featureFlag: "deepseek_feature",
      customAssistantFeatureFlag: undefined,
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = []; // featureFlag not enabled

    expect(
      isModelAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        workspace
      )
    ).toBe(false);
  });

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  it("should return false when large model is not available due to plan", async () => {
    const model = createMockModel({
      providerId: "openai",
      featureFlag: undefined,
      customAssistantFeatureFlag: undefined,
      largeModel: true,
    });
    const featureFlags: WhitelistableFeature[] = [];

    expect(
      isModelAvailableAndWhitelisted(
        model,
        featureFlags,
        nonUpgradedPlan,
        workspace
      )
    ).toBe(false);
  });

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  it("should return false when model requires featureFlag that is not enabled", async () => {
    const model = createMockModel({
      providerId: "openai",
      featureFlag: "deepseek_feature",
      customAssistantFeatureFlag: undefined,
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = []; // featureFlag not enabled

    expect(
      isModelAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        workspace
      )
    ).toBe(false);
  });

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  it("should return true when model requires featureFlag that is enabled and provider is whitelisted", async () => {
    const model = createMockModel({
      providerId: "openai",
      featureFlag: "deepseek_feature",
      customAssistantFeatureFlag: undefined,
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = ["deepseek_feature"];

    expect(
      isModelAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        workspace
      )
    ).toBe(true);
  });

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  it("should return true for large model with upgraded plan and whitelisted provider", async () => {
    const model = createMockModel({
      providerId: "anthropic",
      featureFlag: undefined,
      customAssistantFeatureFlag: undefined,
      largeModel: true,
    });
    const featureFlags: WhitelistableFeature[] = [];

    expect(
      isModelAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        workspace
      )
    ).toBe(true);
  });

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  it("should return false when provider is not whitelisted even if model is available", async () => {
    const model = createMockModel({
      providerId: "xai",
      featureFlag: undefined,
      customAssistantFeatureFlag: undefined,
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];

    // Create a workspace with only openai whitelisted
    const restrictedWorkspace: WorkspaceType = {
      ...workspace,
      whiteListedProviders: ["openai"],
    };

    expect(
      isModelAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        restrictedWorkspace
      )
    ).toBe(false);
  });

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  it("should return true when workspace has all providers whitelisted (default)", async () => {
    const model = createMockModel({
      providerId: "mistral",
      featureFlag: undefined,
      customAssistantFeatureFlag: undefined,
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];

    // WorkspaceFactory.basic() should have all providers whitelisted by default
    expect(
      isModelAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        workspace
      )
    ).toBe(true);
  });

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  it("should return true when whiteListedProviders is null (defaults to all providers)", async () => {
    const model = createMockModel({
      providerId: "togetherai",
      featureFlag: undefined,
      customAssistantFeatureFlag: undefined,
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = [];

    const workspaceWithNullProviders: WorkspaceType = {
      ...workspace,
      whiteListedProviders: null,
    };

    expect(
      isModelAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        workspaceWithNullProviders
      )
    ).toBe(true);
  });

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  it("should return false when model requires customAssistantFeatureFlag that is not enabled", async () => {
    const model = createMockModel({
      providerId: "openai",
      featureFlag: undefined,
      customAssistantFeatureFlag: "openai_o1_feature",
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = []; // customAssistantFeatureFlag not enabled

    expect(
      isModelAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        workspace
      )
    ).toBe(false);
  });

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  it("should return true when model requires customAssistantFeatureFlag that is enabled and provider is whitelisted", async () => {
    const model = createMockModel({
      providerId: "openai",
      featureFlag: undefined,
      customAssistantFeatureFlag: "openai_o1_feature",
      largeModel: false,
    });
    const featureFlags: WhitelistableFeature[] = ["openai_o1_feature"];

    expect(
      isModelAvailableAndWhitelisted(
        model,
        featureFlags,
        upgradedPlan,
        workspace
      )
    ).toBe(true);
  });
});
