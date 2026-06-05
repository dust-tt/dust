import { getGlobalAgents } from "@app/lib/api/assistant/global_agents/global_agents";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { describe, expect, it, vi } from "vitest";

const CUSTOM_MODEL_ID = vi.hoisted(() => "custom-model-for-global-agent-test");

vi.mock("@app/types/assistant/models/custom_models.generated", async () => {
  const { GPT_5_5_MODEL_CONFIG } = await vi.importActual<
    typeof import("@app/types/assistant/models/openai")
  >("@app/types/assistant/models/openai");

  const customModelConfig = {
    ...GPT_5_5_MODEL_CONFIG,
    modelId: CUSTOM_MODEL_ID,
    displayName: "Custom Model Test",
    availableIfOneOf: {
      featureFlag: "custom_model_feature" as const,
    },
    customAvailableIf: {
      featureFlag: "custom_model_feature" as const,
    },
  };

  return {
    CUSTOM_MODEL_CONFIGS: [customModelConfig],
    CUSTOM_MODEL_IDS: [CUSTOM_MODEL_ID],
    CUSTOM_OPENAI_MODEL_IDS: [CUSTOM_MODEL_ID],
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
      'If the request is clearly about Dust itself, enable the "Dust Support" skill before answering.'
    );
    expect(agents[0].instructions).toContain(
      "This includes questions about how to use Dust"
    );
    expect(agents[0].instructions).toContain(
      "Enable and use Dust Support so the response is grounded on public Dust-specific sources."
    );
    expect(agents[0].instructions).toContain(
      "Do not enable Dust Support for generic help requests"
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
});
