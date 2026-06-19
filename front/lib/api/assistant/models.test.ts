import {
  getWhitelistedProviders,
  resolveAgentModelConfiguration,
  validateWorkspaceModelSettings,
} from "@app/lib/api/assistant/models";
import { Authenticator } from "@app/lib/auth";
import { ProviderCredentialResource } from "@app/lib/resources/provider_credential_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { CLAUDE_SONNET_4_6_MODEL_ID } from "@app/types/assistant/models/anthropic";
import {
  AUTO_MODEL_ID,
  AUTO_PROVIDER_ID,
} from "@app/types/assistant/models/dust";
import { GPT_5_5_MODEL_ID } from "@app/types/assistant/models/openai";
import { MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
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

describe("getWhitelistedProviders", () => {
  it("returns all providers including noop when whiteListedProviders is null", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const providers = getWhitelistedProviders(auth);
    expect(providers).toEqual(new Set(MODEL_PROVIDER_IDS));
  });

  it("returns only whitelisted providers plus meta-providers", async () => {
    const workspace = await WorkspaceFactory.basic({
      whiteListedProviders: ["anthropic"],
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const providers = getWhitelistedProviders(auth);
    expect(providers).toEqual(new Set(["anthropic", "noop", "dust"]));
  });

  it("BYOK: only includes providers with configured keys plus meta-providers", async () => {
    const workspace = await WorkspaceFactory.byok();
    mockCredentials([
      { providerId: "openai", isHealthy: true },
      { providerId: "anthropic", isHealthy: false },
    ]);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const providers = getWhitelistedProviders(auth);
    expect(providers).toEqual(new Set(["openai", "anthropic", "noop", "dust"]));
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
    expect(providers).toEqual(new Set(["anthropic", "noop", "dust"]));
  });

  it("BYOK + no keys: only meta-providers are whitelisted", async () => {
    const workspace = await WorkspaceFactory.byok();
    mockCredentials([]);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const providers = getWhitelistedProviders(auth);
    expect(providers).toEqual(new Set(["noop", "dust"]));
  });
});

describe("resolveAgentModelConfiguration", () => {
  const autoAgentModel = {
    providerId: AUTO_PROVIDER_ID,
    modelId: AUTO_MODEL_ID,
    temperature: 0.7,
    reasoningEffort: "medium" as const,
  };

  it("resolves auto to Claude Sonnet 4.6 when no workspace default is set", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const resolved = resolveAgentModelConfiguration(auth, autoAgentModel);
    expect(resolved?.modelConfig.modelId).toBe(CLAUDE_SONNET_4_6_MODEL_ID);
    expect(resolved?.effectiveModel.providerId).toBe("anthropic");
    expect(resolved?.effectiveModel.modelId).toBe(CLAUDE_SONNET_4_6_MODEL_ID);
  });

  it("resolves auto to the workspace default model when set", async () => {
    const workspace = await WorkspaceFactory.basic({
      defaultModelId: GPT_5_5_MODEL_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const resolved = resolveAgentModelConfiguration(auth, autoAgentModel);
    expect(resolved?.modelConfig.modelId).toBe(GPT_5_5_MODEL_ID);
  });

  it("resolves a concrete model to itself", async () => {
    const workspace = await WorkspaceFactory.basic({
      defaultModelId: GPT_5_5_MODEL_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const resolved = resolveAgentModelConfiguration(auth, {
      providerId: "anthropic",
      modelId: CLAUDE_SONNET_4_6_MODEL_ID,
      temperature: 0.5,
    });
    expect(resolved?.modelConfig.modelId).toBe(CLAUDE_SONNET_4_6_MODEL_ID);
  });

  it("uses the workspace backup model when useBackup is set", async () => {
    const workspace = await WorkspaceFactory.basic({
      defaultModelId: GPT_5_5_MODEL_ID,
      backupModelId: CLAUDE_SONNET_4_6_MODEL_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const resolved = resolveAgentModelConfiguration(auth, autoAgentModel, {
      useBackup: true,
    });
    expect(resolved?.modelConfig.modelId).toBe(CLAUDE_SONNET_4_6_MODEL_ID);
  });

  it("clamps an unsupported reasoning effort to the model default", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    // Claude Sonnet 4.6 does not support the "none" effort.
    const resolved = resolveAgentModelConfiguration(auth, {
      providerId: "anthropic",
      modelId: CLAUDE_SONNET_4_6_MODEL_ID,
      temperature: 0.5,
      reasoningEffort: "none",
    });
    expect(resolved?.effectiveModel.reasoningEffort).toBe(
      resolved?.modelConfig.defaultReasoningEffort
    );
    expect(resolved?.effectiveModel.reasoningEffort).not.toBe("none");
  });
});

describe("validateWorkspaceModelSettings", () => {
  it("rejects the auto sentinel as a default model", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const res = await validateWorkspaceModelSettings(auth, {
      defaultModelId: AUTO_MODEL_ID,
    });
    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.type).toBe("model_is_auto");
      expect(res.error.field).toBe("defaultModelId");
    }
  });

  it("rejects an unknown model", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const res = await validateWorkspaceModelSettings(auth, {
      backupModelId: "not-a-real-model",
    });
    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.type).toBe("invalid_model");
      expect(res.error.field).toBe("backupModelId");
    }
  });

  it("accepts an enabled concrete model and null clears", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const res = await validateWorkspaceModelSettings(auth, {
      defaultModelId: CLAUDE_SONNET_4_6_MODEL_ID,
      backupModelId: null,
    });
    expect(res.isOk()).toBe(true);
  });
});
