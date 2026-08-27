import { getGlobalAgents } from "@app/lib/api/assistant/global_agents/global_agents";
import { Authenticator } from "@app/lib/auth";
import { setUserMaxAllowedTier } from "@app/lib/model_tiers/allowed_tiers";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import {
  CLAUDE_OPUS_5_MODEL_ID,
  CLAUDE_SONNET_5_MODEL_ID,
} from "@app/types/assistant/models/anthropic";
import {
  AUTO_FAST_MODEL_ID,
  AUTO_MODEL_ID,
} from "@app/types/assistant/models/auto";
import { GEMINI_3_1_PRO_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";
import {
  GPT_5_5_MODEL_ID,
  GPT_5_6_LUNA_MODEL_ID,
  GPT_5_6_SOL_MODEL_ID,
} from "@app/types/assistant/models/openai";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { describe, expect, it, vi } from "vitest";

const CUSTOM_MODEL_ID = vi.hoisted(() => "custom-model-for-global-agent-test");
const UNBOUND_CUSTOM_MODEL_ID = vi.hoisted(
  () => "custom-model-unbound-for-global-agent-test"
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
  // index 1 is unbound.
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
  ];

  return {
    CUSTOM_MODEL_CONFIGS: mockCustomModels.configs,
    CUSTOM_MODEL_IDS: [CUSTOM_MODEL_ID, UNBOUND_CUSTOM_MODEL_ID],
    CUSTOM_OPENAI_MODEL_IDS: [CUSTOM_MODEL_ID, UNBOUND_CUSTOM_MODEL_ID],
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

  it("reserves Go Deep for explicit deep research requests", async () => {
    const auth = await createAuthenticatorWithFlags([]);

    const agents = await getGlobalAgents(
      auth,
      [GLOBAL_AGENTS_SID.DUST],
      "full"
    );

    expect(agents).toHaveLength(1);
    expect(agents[0].instructions).toContain(
      "only when the user explicitly asks to use Go Deep"
    );
    expect(agents[0].instructions).toContain(
      "Do not infer that Go Deep is needed from task complexity alone"
    );
    expect(agents[0].instructions).toContain("When in doubt, do not enable it");
    expect(agents[0].instructions).not.toContain("3+ steps of tool use");
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

  it("resolves retired soupinou agent variants to the GPT-5.5 fallback", async () => {
    const auth = await createAuthenticatorWithFlags([
      "dust_internal_global_agents",
    ]);

    const agents = await getGlobalAgents(
      auth,
      [
        GLOBAL_AGENTS_SID.DUST_SOUPINOU,
        GLOBAL_AGENTS_SID.DUST_SOUPINOU_MEDIUM,
        GLOBAL_AGENTS_SID.DUST_SOUPINOU_HIGH,
        GLOBAL_AGENTS_SID.DUST_SOUPINOU_NONE,
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
        modelId: GPT_5_5_MODEL_ID,
        reasoningEffort: "light",
      },
      {
        sId: GLOBAL_AGENTS_SID.DUST_SOUPINOU_MEDIUM,
        modelId: GPT_5_5_MODEL_ID,
        reasoningEffort: "medium",
      },
      {
        sId: GLOBAL_AGENTS_SID.DUST_SOUPINOU_HIGH,
        modelId: GPT_5_5_MODEL_ID,
        reasoningEffort: "high",
      },
      {
        sId: GLOBAL_AGENTS_SID.DUST_SOUPINOU_NONE,
        modelId: GPT_5_5_MODEL_ID,
        reasoningEffort: "none",
      },
    ]);
  });

  it("hides agents whose model index is missing from the generated config", async () => {
    const auth = await createAuthenticatorWithFlags([
      "dust_internal_global_agents",
      "custom_model_feature",
    ]);

    const removed = mockCustomModels.configs.splice(0);
    try {
      const agents = await getGlobalAgents(
        auth,
        [
          GLOBAL_AGENTS_SID.DUST_CHAWI,
          GLOBAL_AGENTS_SID.DUST_CHAWI_MEDIUM,
          GLOBAL_AGENTS_SID.DUST_CHAWI_HIGH,
        ],
        "light"
      );

      expect(agents).toEqual([]);
    } finally {
      mockCustomModels.configs.push(...removed);
    }
  });
});

describe("getGlobalAgents OpenAI Dust agents", () => {
  it("uses GPT 5.6 Luna with high reasoning as the Dust default", async () => {
    const auth = await createAuthenticatorWithFlags([]);

    const agents = await getGlobalAgents(
      auth,
      [GLOBAL_AGENTS_SID.DUST],
      "light"
    );

    expect(agents).toHaveLength(1);
    expect(agents[0].model).toMatchObject({
      providerId: "openai",
      modelId: GPT_5_6_LUNA_MODEL_ID,
      reasoningEffort: "high",
    });
  });

  it("keeps Sonnet 5 at medium reasoning when the Sonnet 5 default flag is set", async () => {
    const auth = await createAuthenticatorWithFlags([
      "dust_agent_sonnet_5_default",
    ]);

    const agents = await getGlobalAgents(
      auth,
      [GLOBAL_AGENTS_SID.DUST],
      "light"
    );

    expect(agents).toHaveLength(1);
    expect(agents[0].model).toMatchObject({
      providerId: "anthropic",
      modelId: CLAUDE_SONNET_5_MODEL_ID,
      reasoningEffort: "medium",
    });
  });

  it("hides Luna variants without the internal global agents feature flag", async () => {
    const auth = await createAuthenticatorWithFlags([]);

    const agents = await getGlobalAgents(
      auth,
      [
        GLOBAL_AGENTS_SID.DUST_OAI_LUNA,
        GLOBAL_AGENTS_SID.DUST_OAI_LUNA_MEDIUM,
        GLOBAL_AGENTS_SID.DUST_OAI_LUNA_HIGH,
      ],
      "light"
    );

    expect(agents).toEqual([]);
  });

  it("resolves Sol and Luna variants with light, medium, and high reasoning", async () => {
    const auth = await createAuthenticatorWithFlags([
      "claude_4_5_opus_feature",
      "dust_internal_global_agents",
    ]);

    const agents = await getGlobalAgents(
      auth,
      [
        GLOBAL_AGENTS_SID.DUST_OAI,
        GLOBAL_AGENTS_SID.DUST_OAI_MEDIUM,
        GLOBAL_AGENTS_SID.DUST_OAI_HIGH,
        GLOBAL_AGENTS_SID.DUST_OAI_LUNA,
        GLOBAL_AGENTS_SID.DUST_OAI_LUNA_MEDIUM,
        GLOBAL_AGENTS_SID.DUST_OAI_LUNA_HIGH,
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
        sId: GLOBAL_AGENTS_SID.DUST_OAI,
        modelId: GPT_5_6_SOL_MODEL_ID,
        reasoningEffort: "light",
      },
      {
        sId: GLOBAL_AGENTS_SID.DUST_OAI_MEDIUM,
        modelId: GPT_5_6_SOL_MODEL_ID,
        reasoningEffort: "medium",
      },
      {
        sId: GLOBAL_AGENTS_SID.DUST_OAI_HIGH,
        modelId: GPT_5_6_SOL_MODEL_ID,
        reasoningEffort: "high",
      },
      {
        sId: GLOBAL_AGENTS_SID.DUST_OAI_LUNA,
        modelId: GPT_5_6_LUNA_MODEL_ID,
        reasoningEffort: "light",
      },
      {
        sId: GLOBAL_AGENTS_SID.DUST_OAI_LUNA_MEDIUM,
        modelId: GPT_5_6_LUNA_MODEL_ID,
        reasoningEffort: "medium",
      },
      {
        sId: GLOBAL_AGENTS_SID.DUST_OAI_LUNA_HIGH,
        modelId: GPT_5_6_LUNA_MODEL_ID,
        reasoningEffort: "high",
      },
    ]);
  });
});

describe("getGlobalAgents Deep Dive model routing", () => {
  it("uses Sol with medium reasoning as the Deep Dive primary model", async () => {
    const workspace = await WorkspaceFactory.creditPriced({
      whiteListedProviders: ["anthropic", "openai"],
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const agents = await getGlobalAgents(
      auth,
      [GLOBAL_AGENTS_SID.DEEP_DIVE],
      "light"
    );

    expect(agents).toHaveLength(1);
    expect(agents[0].model).toMatchObject({
      modelId: GPT_5_6_SOL_MODEL_ID,
      reasoningEffort: "medium",
    });
  });

  it("uses Sol medium for Deep Dive while using Sol high for planning and Luna high for tasks", async () => {
    const workspace = await WorkspaceFactory.enterprise({
      whiteListedProviders: ["openai"],
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const agents = await getGlobalAgents(
      auth,
      [
        GLOBAL_AGENTS_SID.DEEP_DIVE,
        GLOBAL_AGENTS_SID.DUST_TASK,
        GLOBAL_AGENTS_SID.DUST_PLANNING,
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
        sId: GLOBAL_AGENTS_SID.DEEP_DIVE,
        modelId: GPT_5_6_SOL_MODEL_ID,
        reasoningEffort: "medium",
      },
      {
        sId: GLOBAL_AGENTS_SID.DUST_TASK,
        modelId: GPT_5_6_LUNA_MODEL_ID,
        reasoningEffort: "high",
      },
      {
        sId: GLOBAL_AGENTS_SID.DUST_PLANNING,
        modelId: GPT_5_6_SOL_MODEL_ID,
        reasoningEffort: "high",
      },
    ]);
  });

  it("falls back to Opus 5 light for enterprise Deep Dive", async () => {
    const workspace = await WorkspaceFactory.enterprise({
      whiteListedProviders: ["anthropic"],
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const agents = await getGlobalAgents(
      auth,
      [
        GLOBAL_AGENTS_SID.DEEP_DIVE,
        GLOBAL_AGENTS_SID.DUST_TASK,
        GLOBAL_AGENTS_SID.DUST_PLANNING,
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
        sId: GLOBAL_AGENTS_SID.DEEP_DIVE,
        modelId: CLAUDE_OPUS_5_MODEL_ID,
        reasoningEffort: "light",
      },
      {
        sId: GLOBAL_AGENTS_SID.DUST_TASK,
        modelId: CLAUDE_SONNET_5_MODEL_ID,
        reasoningEffort: "light",
      },
      {
        sId: GLOBAL_AGENTS_SID.DUST_PLANNING,
        modelId: CLAUDE_OPUS_5_MODEL_ID,
        reasoningEffort: "high",
      },
    ]);
  });

  it("falls back to Sonnet 5 light for non-enterprise Deep Dive", async () => {
    const workspace = await WorkspaceFactory.basic({
      whiteListedProviders: ["anthropic"],
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const agents = await getGlobalAgents(
      auth,
      [GLOBAL_AGENTS_SID.DEEP_DIVE],
      "light"
    );

    expect(agents).toHaveLength(1);
    expect(agents[0].model).toMatchObject({
      modelId: CLAUDE_SONNET_5_MODEL_ID,
      reasoningEffort: "light",
    });
  });

  it("uses the generic large fallback when preferred Deep Dive models are unavailable", async () => {
    const workspace = await WorkspaceFactory.basic({
      whiteListedProviders: ["google_ai_studio"],
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const agents = await getGlobalAgents(
      auth,
      [GLOBAL_AGENTS_SID.DEEP_DIVE],
      "light"
    );

    expect(agents).toHaveLength(1);
    expect(agents[0].model).toMatchObject({
      modelId: GEMINI_3_1_PRO_MODEL_ID,
      reasoningEffort: "light",
    });
  });
});

// @dust is not editable by members, so a Basic-capped member defaulted to the
// Standard stream would get an agent that only ever fails the tier check.
describe("getGlobalAgents Dust Auto default", () => {
  it.each([
    ["premium", AUTO_MODEL_ID],
    ["cost_efficient", AUTO_FAST_MODEL_ID],
  ] as const)("defaults @dust to %s member's highest allowed stream", async (tierName, expectedModelId) => {
    const workspace = await WorkspaceFactory.basic();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await FeatureFlagFactory.basic(adminAuth, "models_picker");

    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    await setUserMaxAllowedTier(adminAuth, {
      userId: user.sId,
      tierName,
    });

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agents = await getGlobalAgents(
      auth,
      [GLOBAL_AGENTS_SID.DUST],
      "light"
    );

    expect(agents).toHaveLength(1);
    expect(agents[0].model).toMatchObject({ modelId: expectedModelId });
  });
});
