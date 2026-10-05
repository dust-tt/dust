import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { AgentConfigurationAssistantPayload } from "@app/types/api/agent_configuration";
import { CLAUDE_SONNET_5_MODEL_ID } from "@app/types/assistant/models/anthropic";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import type { ModelIdType } from "@app/types/assistant/models/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const CUSTOM_MODEL_ID = vi.hoisted(() => "custom-model-for-agent-save-test");
// Null keeps the member's real tier grants.
const allowedTiers = vi.hoisted(() => ({
  value: null as ModelsTierName[] | null,
}));

vi.mock("@app/lib/model_tiers/allowed_tiers", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/model_tiers/allowed_tiers")>();
  return {
    ...actual,
    resolveAllowedTierNames: async (
      ...args: Parameters<typeof actual.resolveAllowedTierNames>
    ) =>
      allowedTiers.value
        ? { tiers: allowedTiers.value }
        : actual.resolveAllowedTierNames(...args),
  };
});

vi.mock("@app/types/assistant/models/custom_models.generated", async () => {
  const { GEMINI_3_8_FLASH_MODEL_CONFIG } = await vi.importActual<
    typeof import("@app/types/assistant/models/google_ai_studio")
  >("@app/types/assistant/models/google_ai_studio");

  return {
    CUSTOM_MODELS: [],
    CUSTOM_MODEL_CONFIGS: [
      {
        ...GEMINI_3_8_FLASH_MODEL_CONFIG,
        modelId: CUSTOM_MODEL_ID,
        availableIfOneOf: { featureFlag: "custom_model_feature" },
      },
    ],
    CUSTOM_MODEL_IDS: [CUSTOM_MODEL_ID],
  };
});

function agentBody(modelId: ModelIdType): AgentConfigurationAssistantPayload {
  return {
    name: "custom-model-save-test",
    description: "Agent save test.",
    instructions: "Be helpful.",
    pictureUrl: "https://dust.tt/static/systemavatar/dust_avatar_full.png",
    status: "active",
    scope: "hidden",
    model: {
      providerId: "google_ai_studio",
      modelId,
      temperature: 0.7,
      reasoningEffort: "medium",
    },
    actions: [],
    skills: [],
    tags: [],
    editors: [],
  };
}

describe("createOrUpgradeAgentConfiguration", () => {
  beforeEach(() => {
    allowedTiers.value = null;
  });

  it("rejects a custom model, even for a workspace with its flag", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    await FeatureFlagFactory.basic(authenticator, "custom_model_feature");

    const res = await createOrUpgradeAgentConfiguration({
      auth: authenticator,
      // Unsafe cast: custom ids only enter `ModelIdType` through the generated file.
      assistant: agentBody(CUSTOM_MODEL_ID as ModelIdType),
    });

    expect(res.isErr()).toBe(true);
  });

  it("saves an agent on a static model", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const res = await createOrUpgradeAgentConfiguration({
      auth: authenticator,
      assistant: agentBody("gemini-3.8-flash"),
    });

    expect(res.isOk()).toBe(true);
  });

  describe("without a reasoning effort", () => {
    function sonnet5Body(): AgentConfigurationAssistantPayload {
      const body = agentBody(CLAUDE_SONNET_5_MODEL_ID);
      return {
        ...body,
        model: {
          providerId: "anthropic",
          modelId: CLAUDE_SONNET_5_MODEL_ID,
          temperature: 0.7,
        },
      };
    }

    it("pins the model's default effort when the member's tiers allow it", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });
      allowedTiers.value = ["cost_efficient", "balanced", "premium"];

      const res = await createOrUpgradeAgentConfiguration({
        auth: authenticator,
        assistant: sonnet5Body(),
      });

      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value.agent.modelConfiguration.reasoningEffort).toBe("high");
      }
    });

    it("pins the highest allowed effort when the default is above the member's tiers", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });
      allowedTiers.value = ["cost_efficient", "balanced"];

      const res = await createOrUpgradeAgentConfiguration({
        auth: authenticator,
        assistant: sonnet5Body(),
      });

      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value.agent.modelConfiguration.reasoningEffort).toBe(
          "medium"
        );
      }
    });
  });
});
