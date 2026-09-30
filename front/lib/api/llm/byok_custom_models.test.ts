import { getWorkspaceFilter } from "@app/lib/api/llm";
import { isModelAvailable } from "@app/lib/assistant";
import { Authenticator } from "@app/lib/auth";
import { getStreamEndpoints } from "@app/lib/llms/stream";
import type { WorkspaceConfig } from "@app/lib/llms/types/filter";
import type { Model } from "@app/lib/model_constructors/types/models";
import { ProviderCredentialFactory } from "@app/tests/utils/ProviderCredentialFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { CUSTOM_MODEL_CONFIGS } from "@app/types/assistant/models/custom_models.generated";
import { describe, expect, it, vi } from "vitest";

const CUSTOM_MODEL_ID = vi.hoisted(() => "byok-test-otter");

vi.mock("@app/types/assistant/models/custom_models.generated", async () => {
  const { CLAUDE_OPUS_5_5_DEFAULT_MODEL_CONFIG } = await vi.importActual<
    typeof import("@app/types/assistant/models/anthropic")
  >("@app/types/assistant/models/anthropic");
  // On the Dust-managed key: the BYOK exclusion must not depend on `useEapKey`.
  const modelConfig = {
    ...CLAUDE_OPUS_5_5_DEFAULT_MODEL_CONFIG,
    modelId: CUSTOM_MODEL_ID,
    displayName: "Byok Test Otter",
    useEapKey: false,
    availableIfOneOf: { featureFlag: "custom_model_feature" as const },
  };
  const endpoint = {
    lab: "anthropic" as const,
    host: "anthropic" as const,
    region: "global" as const,
    hostModel: "claude-host-model-for-byok-test",
    maxOutputTokens: 64_000,
    tokenPricing: { standardInput: 1, standardOutput: 5 },
    input: {
      reasoningEfforts: ["low", "medium"] as ["low", "medium"],
      defaultReasoningEffort: "low" as const,
      supportsForcedTool: false,
    },
  };

  return {
    CUSTOM_MODELS: [{ modelConfig, endpoint }],
    CUSTOM_MODEL_CONFIGS: [modelConfig],
    CUSTOM_MODEL_IDS: [CUSTOM_MODEL_ID],
  };
});

const WORKSPACE_CONFIG: WorkspaceConfig = {
  featureFlags: ["custom_model_feature"],
  isEnterprise: true,
  isCreditPriced: true,
  isAdvancedModels: true,
};

// Unsafe cast: custom ids only enter the `Model` union through the generated file.
const CUSTOM_MODEL = CUSTOM_MODEL_ID as Model;

describe("custom models on byok workspaces", () => {
  it("leaves a byok workspace no endpoint, even on the Dust-managed key", async () => {
    const byokWorkspace = await WorkspaceFactory.byok();
    await ProviderCredentialFactory.basic(byokWorkspace, "anthropic");
    const byokAuth = await Authenticator.internalAdminForWorkspace(
      byokWorkspace.sId
    );
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    expect(
      getStreamEndpoints(WORKSPACE_CONFIG, {
        ...getWorkspaceFilter(byokAuth),
        model: { eq: CUSTOM_MODEL },
      })
    ).toEqual([]);
    expect(
      getStreamEndpoints(WORKSPACE_CONFIG, {
        ...getWorkspaceFilter(auth),
        model: { eq: CUSTOM_MODEL },
      }).length
    ).toBe(1);
  });

  it("is unavailable to a byok plan, even with its flag", async () => {
    const byokWorkspace = await WorkspaceFactory.byok();
    const byokAuth = await Authenticator.internalAdminForWorkspace(
      byokWorkspace.sId
    );
    const [modelConfig] = CUSTOM_MODEL_CONFIGS;

    expect(
      modelConfig &&
        isModelAvailable(modelConfig, {
          featureFlags: ["custom_model_feature"],
          plan: byokAuth.getNonNullablePlan(),
          regionalModelsOnly: false,
          region: "us-central1",
        })
    ).toBe(false);
  });
});
