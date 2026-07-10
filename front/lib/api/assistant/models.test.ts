import { pickPreferredLargeModel } from "@app/lib/api/assistant/model_preferences";
import {
  getWhitelistedProviders,
  selectEnabledModel,
} from "@app/lib/api/assistant/models";
import { resolveModel } from "@app/lib/api/assistant/resolve_model";
import { config as regionConfig } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import * as enabledModels from "@app/lib/model_tiers/enabled_models";
import { ProviderCredentialResource } from "@app/lib/resources/provider_credential_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import {
  CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG,
  CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
} from "@app/types/assistant/models/anthropic";
import { AUTO_MODEL_ID } from "@app/types/assistant/models/auto";
import { GPT_5_5_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import { MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("selectEnabledModel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // An enterprise (upgraded) workspace is what makes Claude Opus 4.8 otherwise
  // selectable, so the only remaining gate under test is regional availability.
  async function enterpriseRegionalOnlyAuth(): Promise<Authenticator> {
    const workspace = await WorkspaceFactory.enterprise({
      regionalModelsOnly: true,
    });

    return Authenticator.internalAdminForWorkspace(workspace.sId);
  }

  it("skips a candidate that is not available in the current region", async () => {
    vi.spyOn(regionConfig, "getCurrentRegion").mockReturnValue("europe-west1");
    const auth = await enterpriseRegionalOnlyAuth();

    // Claude Opus 4.8 is not available in europe-west1, so a regional-only EU
    // workspace must fall through to the next regionally-available candidate
    // instead of picking a model conversation.ts would later reject.
    const selected = selectEnabledModel(
      auth,
      [
        CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG,
        CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
      ],
      { featureFlags: [] }
    );

    expect(selected?.modelId).toBe(
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId
    );

    expect(
      selectEnabledModel(auth, [CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG], {
        featureFlags: [],
      })
    ).toBeNull();
  });

  it("keeps the preferred candidate when it is available in the current region", async () => {
    vi.spyOn(regionConfig, "getCurrentRegion").mockReturnValue("us-central1");
    const auth = await enterpriseRegionalOnlyAuth();

    // The same workspace keeps Claude Opus 4.8 in us-central1, where it is
    // regionally available, so the regional gate does not over-block.
    const selected = selectEnabledModel(
      auth,
      [
        CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG,
        CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
      ],
      { featureFlags: [] }
    );

    expect(selected?.modelId).toBe(
      CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG.modelId
    );
  });
});

function makeAgentConfiguration({
  providerId,
  modelId,
}: {
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
}): LightAgentConfigurationType {
  return {
    id: 1,
    versionCreatedAt: null,
    sId: "agent_test",
    version: 0,
    versionAuthorId: null,
    instructions: null,
    model: {
      providerId,
      modelId,
      temperature: 0,
    },
    status: "active",
    scope: "visible",
    userFavorite: false,
    name: "Test Agent",
    description: "Test Agent",
    pictureUrl: "",
    maxStepsPerRun: 8,
    tags: [],
    templateId: null,
    requestedGroupIds: [],
    requestedSpaceIds: [],
    canRead: true,
    canEdit: false,
  };
}

describe("resolveModel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function enterpriseRegionalOnlyAuth(): Promise<Authenticator> {
    const workspace = await WorkspaceFactory.enterprise({
      regionalModelsOnly: true,
    });

    return Authenticator.internalAdminForWorkspace(workspace.sId);
  }

  it("uses the user's enabled selection and marks resolution as user", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const { resolvedModel, modelResolutionMethod } = await resolveModel(auth, {
      selection: {
        providerId: GPT_5_5_MODEL_CONFIG.providerId,
        modelId: GPT_5_5_MODEL_CONFIG.modelId,
      },
      configuration: makeAgentConfiguration({
        providerId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.providerId,
        modelId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId,
      }),
      featureFlags: [],
    });

    expect(modelResolutionMethod).toBe("user");
    expect(resolvedModel).toEqual({
      providerId: GPT_5_5_MODEL_CONFIG.providerId,
      modelId: GPT_5_5_MODEL_CONFIG.modelId,
      reasoningEffort: GPT_5_5_MODEL_CONFIG.defaultReasoningEffort,
    });
  });

  it("uses the agent model when no selection is provided", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const { resolvedModel, modelResolutionMethod } = await resolveModel(auth, {
      configuration: makeAgentConfiguration({
        providerId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.providerId,
        modelId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId,
      }),
      featureFlags: [],
    });

    expect(modelResolutionMethod).toBe("agent");
    expect(resolvedModel).toEqual({
      providerId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId,
      reasoningEffort:
        CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.defaultReasoningEffort,
    });
  });

  it("falls back to a workspace large model when the agent model is unavailable", async () => {
    vi.spyOn(regionConfig, "getCurrentRegion").mockReturnValue("europe-west1");
    const auth = await enterpriseRegionalOnlyAuth();

    const { resolvedModel, modelResolutionMethod } = await resolveModel(auth, {
      configuration: makeAgentConfiguration({
        providerId: CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG.providerId,
        modelId: CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG.modelId,
      }),
      featureFlags: [],
    });

    expect(modelResolutionMethod).toBe("agent");
    expect(resolvedModel).toEqual({
      providerId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId,
      reasoningEffort:
        CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.defaultReasoningEffort,
    });
  });

  it("falls through a disabled user selection to the agent model", async () => {
    vi.spyOn(regionConfig, "getCurrentRegion").mockReturnValue("europe-west1");
    const auth = await enterpriseRegionalOnlyAuth();

    const { resolvedModel, modelResolutionMethod } = await resolveModel(auth, {
      selection: {
        providerId: CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG.providerId,
        modelId: CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG.modelId,
      },
      configuration: makeAgentConfiguration({
        providerId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.providerId,
        modelId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId,
      }),
      featureFlags: [],
    });

    expect(modelResolutionMethod).toBe("user");
    expect(resolvedModel).toEqual({
      providerId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId,
      reasoningEffort:
        CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.defaultReasoningEffort,
    });
  });

  it("honors a supported reasoning effort from the selection", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const { resolvedModel } = await resolveModel(auth, {
      selection: {
        providerId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.providerId,
        modelId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId,
        reasoningEffort: "high",
      },
      configuration: makeAgentConfiguration({
        providerId: GPT_5_5_MODEL_CONFIG.providerId,
        modelId: GPT_5_5_MODEL_CONFIG.modelId,
      }),
      featureFlags: [],
    });

    expect(resolvedModel.reasoningEffort).toBe("high");
  });

  it("falls back to the model default when the selection pins an unsupported reasoning effort", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const { resolvedModel } = await resolveModel(auth, {
      selection: {
        providerId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.providerId,
        modelId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId,
        reasoningEffort: "none",
      },
      configuration: makeAgentConfiguration({
        providerId: GPT_5_5_MODEL_CONFIG.providerId,
        modelId: GPT_5_5_MODEL_CONFIG.modelId,
      }),
      featureFlags: [],
    });

    expect(resolvedModel.reasoningEffort).toBe(
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.defaultReasoningEffort
    );
  });

  it("resolves an auto agent configuration to a concrete model when models_picker is enabled", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await FeatureFlagFactory.basic(auth, "models_picker");

    const getAutoModelSpy = vi.spyOn(enabledModels, "getAutoModelForAuth");

    const { resolvedModel, modelResolutionMethod } = await resolveModel(auth, {
      configuration: makeAgentConfiguration({
        providerId: AUTO_MODEL_ID,
        modelId: AUTO_MODEL_ID,
      }),
      featureFlags: ["models_picker"],
    });

    expect(getAutoModelSpy).toHaveBeenCalledOnce();
    expect(modelResolutionMethod).toBe("auto");
    expect(resolvedModel.modelId).not.toBe(AUTO_MODEL_ID);
    expect(resolvedModel).toEqual({
      providerId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId,
      reasoningEffort:
        CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.defaultReasoningEffort,
    });
  });

  it("resolves an auto user selection to a concrete model when models_picker is enabled", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await FeatureFlagFactory.basic(auth, "models_picker");

    const getAutoModelSpy = vi.spyOn(enabledModels, "getAutoModelForAuth");

    const { resolvedModel, modelResolutionMethod } = await resolveModel(auth, {
      selection: {
        providerId: AUTO_MODEL_ID,
        modelId: AUTO_MODEL_ID,
      },
      configuration: makeAgentConfiguration({
        providerId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.providerId,
        modelId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId,
      }),
      featureFlags: ["models_picker"],
    });

    expect(getAutoModelSpy).toHaveBeenCalledOnce();
    expect(modelResolutionMethod).toBe("auto");
    expect(resolvedModel.modelId).not.toBe(AUTO_MODEL_ID);
    expect(resolvedModel).toEqual({
      providerId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId,
      reasoningEffort:
        CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.defaultReasoningEffort,
    });
  });

  it("falls back to a preferred large model when the agent is on auto without models_picker", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const getAutoModelSpy = vi.spyOn(enabledModels, "getAutoModelForAuth");

    const { resolvedModel, modelResolutionMethod } = await resolveModel(auth, {
      configuration: makeAgentConfiguration({
        providerId: AUTO_MODEL_ID,
        modelId: AUTO_MODEL_ID,
      }),
      featureFlags: [],
    });

    expect(getAutoModelSpy).not.toHaveBeenCalled();
    expect(modelResolutionMethod).toBe("agent");
    expect(resolvedModel).toEqual({
      providerId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId,
      reasoningEffort:
        CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.defaultReasoningEffort,
    });
  });
});

describe("pickPreferredLargeModel", () => {
  it("picks the first model in the preferred order", () => {
    const selected = pickPreferredLargeModel([
      GPT_5_5_MODEL_CONFIG,
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
    ]);

    expect(selected.modelId).toBe(
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId
    );
  });

  it("falls back to any large model when no preferred model is available", () => {
    const selected = pickPreferredLargeModel([GPT_5_5_MODEL_CONFIG]);

    expect(selected.modelId).toBe(GPT_5_5_MODEL_CONFIG.modelId);
  });

  it("falls back to the hardcoded default when no models are available", () => {
    const models: ModelConfigurationType[] = [];
    const selected = pickPreferredLargeModel(models);

    expect(selected.modelId).toBe(
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId
    );
  });
});
