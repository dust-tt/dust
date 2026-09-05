import { pickPreferredLargeModel } from "@app/lib/api/assistant/model_preferences";
import {
  getEffectiveWhiteListedProviders,
  getWhitelistedProviders,
} from "@app/lib/api/assistant/models";
import { resolveModel } from "@app/lib/api/assistant/resolve_model";
import { Authenticator } from "@app/lib/auth";
import { setWorkspaceMaxAllowedTierName } from "@app/lib/model_tiers/allowed_tiers";
import * as enabledModels from "@app/lib/model_tiers/enabled_models";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { ProviderCredentialResource } from "@app/lib/resources/provider_credential_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import { AUTO_MODEL_ID, MODEL_STREAMS } from "@app/types/assistant/models/auto";
import { getTierForModel } from "@app/types/assistant/models/model_tiers";
import {
  GPT_5_4_MINI_MODEL_CONFIG,
  GPT_5_5_MODEL_CONFIG,
  GPT_5_6_LUNA_MODEL_CONFIG,
} from "@app/types/assistant/models/openai";
import { MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import {
  GROK_4_5_MODEL_CONFIG,
  GROK_4_6_MODEL_CONFIG,
  GROK_4_MODEL_CONFIG,
} from "@app/types/assistant/models/xai";
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

// Workspace fetches and the WorkspaceType served by the Authenticator carry the configured
// whiteListedProviders untouched. The global provider kill switches are overlaid only here,
// when the effective value is resolved for gating.
describe("getEffectiveWhiteListedProviders", () => {
  afterEach(async () => {
    await KillSwitchResource.disableKillSwitch("global_blacklist_openai");
  });

  it("returns the configured providers when no kill switch is enabled", async () => {
    const workspace = await WorkspaceFactory.basic({
      whiteListedProviders: ["openai", "anthropic"],
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await expect(getEffectiveWhiteListedProviders(auth)).resolves.toEqual([
      "openai",
      "anthropic",
    ]);
  });

  it("overlays global provider kill switches without touching the configured value", async () => {
    const workspace = await WorkspaceFactory.basic({
      whiteListedProviders: ["openai", "anthropic"],
    });
    await KillSwitchResource.enableKillSwitch("global_blacklist_openai");

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await expect(getEffectiveWhiteListedProviders(auth)).resolves.toEqual([
      "anthropic",
    ]);
    expect(auth.getNonNullableWorkspace().whiteListedProviders).toEqual([
      "openai",
      "anthropic",
    ]);
  });
});

describe("getWhitelistedProviders", () => {
  it("returns all providers including noop when whiteListedProviders is null", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const providers = getWhitelistedProviders(
      auth,
      await getEffectiveWhiteListedProviders(auth)
    );
    expect(providers).toEqual(new Set(MODEL_PROVIDER_IDS));
  });

  it("returns only whitelisted providers plus noop", async () => {
    const workspace = await WorkspaceFactory.basic({
      whiteListedProviders: ["anthropic"],
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const providers = getWhitelistedProviders(
      auth,
      await getEffectiveWhiteListedProviders(auth)
    );
    expect(providers).toEqual(new Set(["anthropic", "noop"]));
  });

  it("BYOK: only includes providers with configured keys plus noop", async () => {
    const workspace = await WorkspaceFactory.byok();
    mockCredentials([
      { providerId: "openai", isHealthy: true },
      { providerId: "anthropic", isHealthy: false },
    ]);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const providers = getWhitelistedProviders(
      auth,
      await getEffectiveWhiteListedProviders(auth)
    );
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

    const providers = getWhitelistedProviders(
      auth,
      await getEffectiveWhiteListedProviders(auth)
    );
    expect(providers).toEqual(new Set(["anthropic", "noop"]));
  });

  it("BYOK + no keys: only noop is whitelisted", async () => {
    const workspace = await WorkspaceFactory.byok();
    mockCredentials([]);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const providers = getWhitelistedProviders(
      auth,
      await getEffectiveWhiteListedProviders(auth)
    );
    expect(providers).toEqual(new Set(["noop"]));
  });
});

function makeAgentConfiguration({
  providerId,
  modelId,
  reasoningEffort,
  sId = "agent_test",
}: {
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
  reasoningEffort?: ReasoningEffort;
  sId?: string;
}): LightAgentConfigurationType {
  return {
    id: 1,
    versionCreatedAt: null,
    sId,
    version: 0,
    versionAuthorId: null,
    instructions: null,
    model: {
      providerId,
      modelId,
      temperature: 0,
      reasoningEffort,
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

  it("honors a supported reasoning effort configured on the agent", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const { resolvedModel, modelResolutionMethod } = await resolveModel(auth, {
      configuration: makeAgentConfiguration({
        providerId: GPT_5_6_LUNA_MODEL_CONFIG.providerId,
        modelId: GPT_5_6_LUNA_MODEL_CONFIG.modelId,
        reasoningEffort: "high",
      }),
      featureFlags: [],
    });

    expect(modelResolutionMethod).toBe("agent");
    expect(resolvedModel).toEqual({
      providerId: GPT_5_6_LUNA_MODEL_CONFIG.providerId,
      modelId: GPT_5_6_LUNA_MODEL_CONFIG.modelId,
      reasoningEffort: "high",
    });
  });

  it("falls back to the model default for an unsupported agent effort", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const { resolvedModel } = await resolveModel(auth, {
      configuration: makeAgentConfiguration({
        providerId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.providerId,
        modelId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId,
        reasoningEffort: "none",
      }),
      featureFlags: [],
    });

    expect(resolvedModel.reasoningEffort).toBe(
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.defaultReasoningEffort
    );
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

  it("resolves an auto agent configuration to a concrete model", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const resolveStreamModelSpy = vi.spyOn(enabledModels, "resolveStreamModel");

    const { resolvedModel, modelResolutionMethod } = await resolveModel(auth, {
      configuration: makeAgentConfiguration({
        providerId: AUTO_MODEL_ID,
        modelId: AUTO_MODEL_ID,
      }),
      featureFlags: [],
    });

    // `auto` is a stream like `auto_fast` / `auto_complex`: it routes through
    // resolveStreamModel and resolves to its first available candidate, which
    // is Luna at `high` reasoning.
    expect(resolveStreamModelSpy).toHaveBeenCalledWith(
      expect.any(Array),
      AUTO_MODEL_ID,
      expect.any(Set)
    );
    expect(modelResolutionMethod).toBe("auto");
    expect(resolvedModel.modelId).not.toBe(AUTO_MODEL_ID);
    expect(resolvedModel).toEqual({
      providerId: GPT_5_6_LUNA_MODEL_CONFIG.providerId,
      modelId: GPT_5_6_LUNA_MODEL_CONFIG.modelId,
      reasoningEffort: "high",
    });
  });

  it("resolves the sidekick's auto stream above the member's tier cap", async () => {
    const workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await setWorkspaceMaxAllowedTierName(auth, "cost_efficient");

    // A regular agent on `auto` stays within the workspace's Basic cap.
    const regular = await resolveModel(auth, {
      configuration: makeAgentConfiguration({
        providerId: AUTO_MODEL_ID,
        modelId: AUTO_MODEL_ID,
      }),
      featureFlags: [],
    });
    expect(
      getTierForModel(
        regular.resolvedModel.modelId,
        regular.resolvedModel.reasoningEffort
      )
    ).toBe("cost_efficient");

    // The sidekick ignores the cap and resolves to the stream's first candidate.
    const sidekick = await resolveModel(auth, {
      configuration: makeAgentConfiguration({
        providerId: AUTO_MODEL_ID,
        modelId: AUTO_MODEL_ID,
        sId: GLOBAL_AGENTS_SID.SIDEKICK,
      }),
      featureFlags: [],
    });
    expect(sidekick.modelResolutionMethod).toBe(AUTO_MODEL_ID);
    expect(sidekick.resolvedModel).toEqual(MODEL_STREAMS[AUTO_MODEL_ID][0]);
  });

  it("resolves an auto user selection to a concrete model", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const resolveStreamModelSpy = vi.spyOn(enabledModels, "resolveStreamModel");

    const { resolvedModel, modelResolutionMethod } = await resolveModel(auth, {
      selection: {
        providerId: AUTO_MODEL_ID,
        modelId: AUTO_MODEL_ID,
      },
      configuration: makeAgentConfiguration({
        providerId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.providerId,
        modelId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId,
      }),
      featureFlags: [],
    });

    expect(resolveStreamModelSpy).toHaveBeenCalledWith(
      expect.any(Array),
      AUTO_MODEL_ID,
      expect.any(Set)
    );
    expect(modelResolutionMethod).toBe("auto");
    expect(resolvedModel.modelId).not.toBe(AUTO_MODEL_ID);
    expect(resolvedModel).toEqual({
      providerId: GPT_5_6_LUNA_MODEL_CONFIG.providerId,
      modelId: GPT_5_6_LUNA_MODEL_CONFIG.modelId,
      reasoningEffort: "high",
    });
  });
});

describe("pickPreferredLargeModel", () => {
  it("prefers Grok 4.6 over previous Grok models", () => {
    const selected = pickPreferredLargeModel([
      GROK_4_MODEL_CONFIG,
      GROK_4_5_MODEL_CONFIG,
      GROK_4_6_MODEL_CONFIG,
    ]);

    expect(selected.modelId).toBe(GROK_4_6_MODEL_CONFIG.modelId);
  });

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

  it("prefers Sonnet 4.6 as the cost-effective pick under a cost_efficient cap", () => {
    // Under a cost_efficient tier cap, Sonnet 4.6 (at light reasoning) remains
    // the preferred selectable model over other cost-effective options.
    const selected = pickPreferredLargeModel([
      GPT_5_4_MINI_MODEL_CONFIG,
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
    ]);

    expect(selected.modelId).toBe(
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId
    );
  });

  it("falls back to the hardcoded default when no models are available", () => {
    const models: ModelConfigurationType[] = [];
    const selected = pickPreferredLargeModel(models);

    expect(selected.modelId).toBe(
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId
    );
  });
});
