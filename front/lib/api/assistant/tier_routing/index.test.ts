import assert from "node:assert";
import type { DecideAutoTierRouting } from "@app/lib/api/assistant/tier_routing";
import { applyAutoTierRouting } from "@app/lib/api/assistant/tier_routing";
import { Authenticator } from "@app/lib/auth";
import { DustOpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne } from "@app/lib/llms/system_one/endpoints/openai_gpt_six_luna_global_openai_decisions";
import type { DecisionResult } from "@app/lib/model_constructors/types/output/decisions";
import type { ErrorEvent } from "@app/lib/model_constructors/types/output/events";
import { buildErrorEvent } from "@app/lib/model_constructors/utils/build_error_event";
import { setUserMaxAllowedTier } from "@app/lib/model_tiers/allowed_tiers";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { ModelStreamIdType } from "@app/types/assistant/models/auto";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const decision = vi.hoisted(() => ({
  probabilities: [] as number[],
  fails: false,
  calls: 0,
}));

class FakeDecisionEndpoint extends DustOpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne {
  override async decide(): Promise<Result<DecisionResult, ErrorEvent>> {
    decision.calls += 1;
    if (decision.fails) {
      return new Err(
        buildErrorEvent({
          errorSource: "provider",
          metadata: this.metadata(),
          type: "timeout_error",
          message: "Decision timed out",
        })
      );
    }

    return new Ok({
      answers: [
        {
          type: "score",
          name: "minimum_tier",
          score: 0,
          confidence: 0,
          probabilities: decision.probabilities.map((probability, value) => ({
            label: `level_${value}`,
            value,
            probability,
          })),
        },
      ],
      usage: {
        standardInput: 200,
        cacheHit: 0,
        cacheCreated: 0,
        longCacheCreated: 0,
        shortCacheCreated: 0,
        totalOutput: 0,
      },
    });
  }
}

vi.mock(
  import("@app/lib/api/llm/selectPreferredEndpointForWorkspace"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    selectPreferredSystemOneEndpointForWorkspace: async () =>
      FakeDecisionEndpoint,
  })
);

beforeEach(() => {
  decision.probabilities = [];
  decision.fails = false;
  decision.calls = 0;
});

type RoutingSetUp = {
  agent: AgentResource;
  decide: DecideAutoTierRouting;
};

async function setUp(
  auth: Authenticator,
  modelId: ModelStreamIdType
): Promise<RoutingSetUp> {
  const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
    auth,
    { model: { providerId: modelId, modelId } }
  );
  const agent = await AgentResource.fetchById(auth, agentConfiguration.sId);
  assert(agent, "expected the test agent");
  const { sId } = await ConversationFactory.create(auth, {
    agentConfigurationId: agent.sId,
    messagesCreatedAt: [],
  });
  const conversation = await ConversationResource.fetchById(auth, sId);
  assert(conversation, "expected the test conversation");

  return {
    agent,
    decide: {
      type: "decide",
      conversation,
      message: {
        content: "Say hi.",
        context: {
          username: "user",
          fullName: null,
          email: null,
          profilePictureUrl: null,
          timezone: "UTC",
          origin: "web",
        },
        userId: auth.user()?.sId ?? null,
      },
    },
  };
}

function decide(auth: Authenticator, { agent, decide }: RoutingSetUp) {
  return applyAutoTierRouting(auth, agent, decide);
}

function followCurrent(auth: Authenticator, { agent, decide }: RoutingSetUp) {
  return applyAutoTierRouting(auth, agent, {
    type: "follow_current",
    conversation: decide.conversation.toJSON(),
  });
}

describe("applyAutoTierRouting", () => {
  it("does not route when the feature flag is off", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const params = await setUp(auth, "auto");

    expect(await decide(auth, params)).toBeNull();
    expect(decision.calls).toBe(0);
  });

  it("does not route an agent on the basic stream", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "auto_tier_routing");
    const params = await setUp(auth, "auto_fast");

    expect(await decide(auth, params)).toBeNull();
    expect(decision.calls).toBe(0);
  });

  it("routes down and records the decision as a run", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "auto_tier_routing");
    const params = await setUp(auth, "auto");
    decision.probabilities = [0.9, 0.1];

    const route = await decide(auth, params);

    assert(route?.decisionRunId, "expected a routing decision");
    expect(route.streamId).toBe("auto_fast");
    const run = await RunResource.fetchByDustRunId(auth, {
      dustRunId: route.decisionRunId,
    });
    expect(run).not.toBeNull();
  });

  it("stops routing once a decision lands on the configured stream", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "auto_tier_routing");
    const params = await setUp(auth, "auto");
    decision.probabilities = [0.2, 0.8];

    const first = await decide(auth, params);
    const second = await decide(auth, params);

    expect(first?.streamId).toBe("auto");
    expect(second).toBeNull();
    expect(decision.calls).toBe(1);
  });

  it("fails open to the configured stream without settling", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "auto_tier_routing");
    const params = await setUp(auth, "auto");
    decision.fails = true;

    const first = await decide(auth, params);
    const second = await decide(auth, params);

    expect(first?.streamId).toBe("auto");
    expect(second?.streamId).toBe("auto");
    expect(decision.calls).toBe(2);
  });

  it("does not route a member who cannot run the configured stream", async () => {
    const { authenticator, user, workspace } = await createResourceTest({});
    await FeatureFlagFactory.basic(authenticator, "auto_tier_routing");
    const capped = await setUserMaxAllowedTier(
      await Authenticator.internalAdminForWorkspace(workspace.sId),
      { userId: user.sId, tierName: "balanced" }
    );
    assert(capped.isOk(), "expected the member's tier to be capped");
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const params = await setUp(auth, "auto_complex");
    decision.probabilities = [0.9, 0.05, 0.05];

    expect(await decide(auth, params)).toBeNull();
    expect(decision.calls).toBe(0);
  });

  describe("follow_current", () => {
    it("keeps the configured stream before any decision", async () => {
      const { authenticator: auth } = await createResourceTest({});
      await FeatureFlagFactory.basic(auth, "auto_tier_routing");
      const params = await setUp(auth, "auto");

      expect(await followCurrent(auth, params)).toBeNull();
      expect(decision.calls).toBe(0);
    });

    it("runs on the routed stream without a new decision", async () => {
      const { authenticator: auth } = await createResourceTest({});
      await FeatureFlagFactory.basic(auth, "auto_tier_routing");
      const params = await setUp(auth, "auto");
      decision.probabilities = [0.9, 0.1];
      await decide(auth, params);

      const route = await followCurrent(auth, params);

      expect(route).toEqual({ streamId: "auto_fast" });
      expect(decision.calls).toBe(1);
    });

    it("keeps the configured stream once routing settled", async () => {
      const { authenticator: auth } = await createResourceTest({});
      await FeatureFlagFactory.basic(auth, "auto_tier_routing");
      const params = await setUp(auth, "auto");
      decision.probabilities = [0.2, 0.8];
      await decide(auth, params);

      expect(await followCurrent(auth, params)).toBeNull();
      expect(decision.calls).toBe(1);
    });
  });
});
