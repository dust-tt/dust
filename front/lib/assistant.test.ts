import {
  filterCustomAvailableAndWhitelistedModels,
  getWhitelistedProviders,
  isModelCustomAvailable,
} from "@app/lib/assistant";
import { Authenticator } from "@app/lib/auth";
import {
  DUST_COMPANY_PLAN_CODE,
  FREE_NO_PLAN_CODE,
  FREE_UPGRADED_PLAN_CODE,
  PRO_PLAN_SEAT_29_CODE,
} from "@app/lib/plans/plan_codes";
import { ProviderCredentialResource } from "@app/lib/resources/provider_credential_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import { MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import type { PlanType } from "@app/types/plan";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/resources/provider_credential_resource");

function mockCredentials(
  credentials: Array<{
    providerId: ModelProviderIdType;
    isHealthy: boolean;
  }>
) {
  const health = Object.fromEntries(
    credentials.map((c) => [c.providerId, c.isHealthy])
  ) as Partial<Record<ModelProviderIdType, boolean>>;

  vi.mocked(
    ProviderCredentialResource.fetchProvidersHealthByWorkspaceId
  ).mockResolvedValue(health);
}

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

describe("getWhitelistedProviders", () => {
  it("returns all providers including noop when whiteListedProviders is null", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const providers = getWhitelistedProviders(auth);
    expect(providers).toEqual(new Set(MODEL_PROVIDER_IDS));
  });

  it("returns only whitelisted providers plus noop", async () => {
    const workspace = await WorkspaceFactory.basic({
      whiteListedProviders: ["anthropic"],
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const providers = getWhitelistedProviders(auth);
    expect(providers).toEqual(new Set(["anthropic", "noop"]));
  });

  it("BYOK: only includes providers with configured keys plus noop", async () => {
    const workspace = await WorkspaceFactory.byok();
    mockCredentials([
      { providerId: "openai", isHealthy: true },
      { providerId: "anthropic", isHealthy: false },
    ]);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const providers = getWhitelistedProviders(auth);
    expect(providers).toEqual(new Set(["openai", "anthropic", "noop"]));
  });

  it("BYOK + restricted whitelist: healthy key for non-whitelisted provider is ignored", async () => {
    const workspace = await WorkspaceFactory.byok({
      whiteListedProviders: ["anthropic"],
    });
    mockCredentials([
      { providerId: "openai", isHealthy: true },
      { providerId: "anthropic", isHealthy: true },
    ]);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const providers = getWhitelistedProviders(auth);
    expect(providers).toEqual(new Set(["anthropic", "noop"]));
  });

  it("BYOK + no keys: only noop is whitelisted", async () => {
    const workspace = await WorkspaceFactory.byok();
    mockCredentials([]);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const providers = getWhitelistedProviders(auth);
    expect(providers).toEqual(new Set(["noop"]));
  });
});

describe("isModelCustomAvailable", () => {
  it("should return true for a basic model without restrictions", () => {
    const model = createMockModel({ largeModel: false });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, [], plan)).toBe(true);
  });

  it("should return true when featureFlag is enabled", () => {
    const model = createMockModel({
      availableIfOneOf: { featureFlag: "deepseek_feature" },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, ["deepseek_feature"], plan)).toBe(
      true
    );
  });

  it("should return false when featureFlag is not enabled", () => {
    const model = createMockModel({
      availableIfOneOf: { featureFlag: "deepseek_feature" },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, [], plan)).toBe(false);
  });

  it("should return true when customAssistantFeatureFlag is enabled", () => {
    const model = createMockModel({
      customAvailableIf: { featureFlag: "openai_o1_feature" },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, ["openai_o1_feature"], plan)).toBe(
      true
    );
  });

  it("should return false when customAssistantFeatureFlag is not enabled", () => {
    const model = createMockModel({
      customAvailableIf: { featureFlag: "openai_o1_feature" },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, [], plan)).toBe(false);
  });

  it("should return true for large model with upgraded plan", () => {
    const model = createMockModel({ largeModel: true });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, [], plan)).toBe(true);
  });

  it("should return true for large model with free upgraded plan", () => {
    const model = createMockModel({ largeModel: true });
    const plan = createMockPlan(FREE_UPGRADED_PLAN_CODE);

    expect(isModelCustomAvailable(model, [], plan)).toBe(true);
  });

  it("should return false for large model without upgraded plan", () => {
    const model = createMockModel({
      largeModel: true,
      availableIfOneOf: { enterprise: true },
    });
    const plan = createMockPlan(FREE_NO_PLAN_CODE);

    expect(isModelCustomAvailable(model, [], plan)).toBe(false);
  });

  it("should return false for large model with null plan", () => {
    const model = createMockModel({
      largeModel: true,
      availableIfOneOf: { enterprise: true },
    });

    expect(isModelCustomAvailable(model, [], null)).toBe(false);
  });

  it("should return false when both featureFlag and customAssistantFeatureFlag are required but only one is enabled", () => {
    const model = createMockModel({
      availableIfOneOf: { featureFlag: "deepseek_feature" },
      customAvailableIf: { featureFlag: "openai_o1_feature" },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, ["deepseek_feature"], plan)).toBe(
      false
    );
  });

  it("should return true when both featureFlag and customAssistantFeatureFlag are required and both are enabled", () => {
    const model = createMockModel({
      availableIfOneOf: { featureFlag: "deepseek_feature" },
      customAvailableIf: { featureFlag: "openai_o1_feature" },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(
      isModelCustomAvailable(
        model,
        ["deepseek_feature", "openai_o1_feature"],
        plan
      )
    ).toBe(true);
  });

  it("should return false when large model requires upgraded plan but featureFlag is missing", () => {
    const model = createMockModel({
      availableIfOneOf: { featureFlag: "deepseek_feature" },
      largeModel: true,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, [], plan)).toBe(false);
  });

  it("should return true when enterprise is set and plan is an enterprise plan", () => {
    const model = createMockModel({
      availableIfOneOf: { enterprise: true },
      largeModel: false,
    });
    const plan = createMockPlan(DUST_COMPANY_PLAN_CODE);

    expect(isModelCustomAvailable(model, [], plan)).toBe(true);
  });

  it("should return true when enterprise is set and plan has ENT_ prefix", () => {
    const model = createMockModel({
      availableIfOneOf: { enterprise: true },
      largeModel: false,
    });
    const plan = createMockPlan("ENT_CUSTOM_PLAN");

    expect(isModelCustomAvailable(model, [], plan)).toBe(true);
  });

  it("should return true when both enterprise and featureFlag are set, with enterprise plan", () => {
    const model = createMockModel({
      availableIfOneOf: { enterprise: true, featureFlag: "deepseek_feature" },
      largeModel: false,
    });
    const plan = createMockPlan(DUST_COMPANY_PLAN_CODE);

    expect(isModelCustomAvailable(model, [], plan)).toBe(true);
  });

  it("should return true when both enterprise and featureFlag are set, with featureFlag enabled", () => {
    const model = createMockModel({
      availableIfOneOf: { enterprise: true, featureFlag: "deepseek_feature" },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, ["deepseek_feature"], plan)).toBe(
      true
    );
  });

  it("should return false when both enterprise and featureFlag are set but neither condition is met", () => {
    const model = createMockModel({
      availableIfOneOf: { enterprise: true, featureFlag: "deepseek_feature" },
      largeModel: false,
    });
    const plan = createMockPlan(PRO_PLAN_SEAT_29_CODE);

    expect(isModelCustomAvailable(model, [], plan)).toBe(false);
  });
});

describe("filterCustomAvailableAndWhitelistedModels", () => {
  it("should include model when available and provider is whitelisted", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const model = createMockModel({ providerId: "openai", largeModel: false });

    const result = await filterCustomAvailableAndWhitelistedModels(
      [model],
      [],
      auth
    );
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

    const result = await filterCustomAvailableAndWhitelistedModels(
      [model],
      [],
      auth
    );
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

    const result = await filterCustomAvailableAndWhitelistedModels(
      [model],
      [],
      auth
    );
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

    const result = await filterCustomAvailableAndWhitelistedModels(
      [model],
      ["deepseek_feature"],
      auth
    );
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

    const result = await filterCustomAvailableAndWhitelistedModels(
      [openaiModel, xaiModel],
      [],
      auth
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

    const result = await filterCustomAvailableAndWhitelistedModels(
      [model],
      [],
      auth
    );
    expect(result).toContain(model);
  });
});
