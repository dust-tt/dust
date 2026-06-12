import { getGlobalAgents } from "@app/lib/api/assistant/global_agents/global_agents";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { describe, expect, it, vi } from "vitest";

const CUSTOM_MODEL_ID = vi.hoisted(() => "custom-model-for-global-agent-test");
const UNBOUND_CUSTOM_MODEL_ID = vi.hoisted(
  () => "custom-model-unbound-for-global-agent-test"
);
const SOUPINOU_CUSTOM_MODEL_ID = vi.hoisted(
  () => "custom-model-for-soupinou-global-agent-test"
);
// Shared reference to the mocked CUSTOM_MODEL_CONFIGS array so tests can
// simulate a model index missing from the generated config.
const mockCustomModels = vi.hoisted(() => ({
  configs: [] as unknown[],
}));

vi.mock("@app/types/assistant/models/custom_models.generated", async () => {
  const { GPT_5_5_MODEL_CONFIG } = await vi.importActual<
    typeof import("@app/types/assistant/models/openai")
  >("@app/types/assistant/models/openai");

  const baseCustomModelConfig = {
    ...GPT_5_5_MODEL_CONFIG,
    availableIfOneOf: {
      featureFlag: "custom_model_feature" as const,
    },
    customAvailableIf: {
      featureFlag: "custom_model_feature" as const,
    },
  };

  // Mirrors the infra config layout: index 0 is bound to the chawi agents,
  // index 1 is unbound, index 2 is bound to the soupinou agents.
  mockCustomModels.configs = [
    {
      ...baseCustomModelConfig,
      modelId: CUSTOM_MODEL_ID,
      displayName: "Custom Model Test",
    },
    {
      ...baseCustomModelConfig,
      modelId: UNBOUND_CUSTOM_MODEL_ID,
      displayName: "Unbound Custom Model Test",
    },
    {
      ...baseCustomModelConfig,
      modelId: SOUPINOU_CUSTOM_MODEL_ID,
      displayName: "Soupinou Custom Model Test",
    },
  ];

  return {
    CUSTOM_MODEL_CONFIGS: mockCustomModels.configs,
    CUSTOM_MODEL_IDS: [
      CUSTOM_MODEL_ID,
      UNBOUND_CUSTOM_MODEL_ID,
      SOUPINOU_CUSTOM_MODEL_ID,
    ],
    CUSTOM_OPENAI_MODEL_IDS: [
      CUSTOM_MODEL_ID,
      UNBOUND_CUSTOM_MODEL_ID,
      SOUPINOU_CUSTOM_MODEL_ID,
    ],
    CUSTOM_ANTHROPIC_MODEL_IDS: [],
  };
});

async function createAuthenticatorWithFlags(flags: WhitelistableFeature[]) {
  const { authenticator } = await createResourceTest({ role: "admin" });

  for (const flag of flags) {
    await FeatureFlagFactory.basic(authenticator, flag);
  }

  return authenticator;
}

describe("getGlobalAgents custom model agents", () => {
  it("routes Dust support intent through the Dust Support skill", async () => {
    const auth = await createAuthenticatorWithFlags([]);

    const agents = await getGlobalAgents(
      auth,
      [GLOBAL_AGENTS_SID.DUST],
      "full"
    );

    expect(agents).toHaveLength(1);
    expect(agents[0].instructions).toContain(
      'For clear Dust platform support requests, enable the "Dust Support" skill before answering.'
    );
    expect(agents[0].instructions).toContain(
      "This includes Dust usage, capabilities, limits"
    );
    expect(agents[0].instructions).toContain(
      'Do not enable it for generic help requests, non-Dust products, or ambiguous mentions of "dust".'
    );
    expect(agents[0].instructions).not.toContain(
      "https://dust-community.tightknit.community/join"
    );
    expect(agents[0].skills).toContain("discover_skills");
    expect(agents[0].skills).toContain("support");
  });

  it("hides custom Dust agents without the custom model feature flag", async () => {
    const auth = await createAuthenticatorWithFlags([
      "dust_internal_global_agents",
    ]);

    const agents = await getGlobalAgents(
      auth,
      [GLOBAL_AGENTS_SID.DUST_CHAWI],
      "light"
    );

    expect(agents).toEqual([]);
  });

  it("resolves custom Dust agent variants to the generated custom model", async () => {
    const auth = await createAuthenticatorWithFlags([
      "dust_internal_global_agents",
      "custom_model_feature",
    ]);

    const agents = await getGlobalAgents(
      auth,
      [
        GLOBAL_AGENTS_SID.DUST_CHAWI,
        GLOBAL_AGENTS_SID.DUST_CHAWI_MEDIUM,
        GLOBAL_AGENTS_SID.DUST_CHAWI_HIGH,
      ],
      "light"
    );

    expect(
      agents.map((agent) => ({
        sId: agent.sId,
        providerId: agent.model.providerId,
        modelId: agent.model.modelId,
        reasoningEffort: agent.model.reasoningEffort,
      }))
    ).toEqual([
      {
        sId: GLOBAL_AGENTS_SID.DUST_CHAWI,
        providerId: "openai",
        modelId: CUSTOM_MODEL_ID,
        reasoningEffort: "light",
      },
      {
        sId: GLOBAL_AGENTS_SID.DUST_CHAWI_MEDIUM,
        providerId: "openai",
        modelId: CUSTOM_MODEL_ID,
        reasoningEffort: "medium",
      },
      {
        sId: GLOBAL_AGENTS_SID.DUST_CHAWI_HIGH,
        providerId: "openai",
        modelId: CUSTOM_MODEL_ID,
        reasoningEffort: "high",
      },
    ]);
  });

  it("resolves soupinou agent variants to the custom model at index 2", async () => {
    const auth = await createAuthenticatorWithFlags([
      "dust_internal_global_agents",
      "custom_model_feature",
    ]);

    const agents = await getGlobalAgents(
      auth,
      [
        GLOBAL_AGENTS_SID.DUST_SOUPINOU,
        GLOBAL_AGENTS_SID.DUST_SOUPINOU_MEDIUM,
        GLOBAL_AGENTS_SID.DUST_SOUPINOU_HIGH,
      ],
      "light"
    );

    expect(
      agents.map((agent) => ({
        sId: agent.sId,
        modelId: agent.model.modelId,
        reasoningEffort: agent.model.reasoningEffort,
      }))
    ).toEqual([
      {
        sId: GLOBAL_AGENTS_SID.DUST_SOUPINOU,
        modelId: SOUPINOU_CUSTOM_MODEL_ID,
        reasoningEffort: "light",
      },
      {
        sId: GLOBAL_AGENTS_SID.DUST_SOUPINOU_MEDIUM,
        modelId: SOUPINOU_CUSTOM_MODEL_ID,
        reasoningEffort: "medium",
      },
      {
        sId: GLOBAL_AGENTS_SID.DUST_SOUPINOU_HIGH,
        modelId: SOUPINOU_CUSTOM_MODEL_ID,
        reasoningEffort: "high",
      },
    ]);
  });

  it("hides agents whose model index is missing from the generated config", async () => {
    const auth = await createAuthenticatorWithFlags([
      "dust_internal_global_agents",
      "custom_model_feature",
    ]);

    const removed = mockCustomModels.configs.splice(2, 1);
    try {
      const agents = await getGlobalAgents(
        auth,
        [
          GLOBAL_AGENTS_SID.DUST_SOUPINOU,
          GLOBAL_AGENTS_SID.DUST_SOUPINOU_MEDIUM,
          GLOBAL_AGENTS_SID.DUST_SOUPINOU_HIGH,
        ],
        "light"
      );

      expect(agents).toEqual([]);
    } finally {
      mockCustomModels.configs.push(...removed);
    }
  });
});
