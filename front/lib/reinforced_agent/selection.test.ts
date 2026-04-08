import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/utils/statsd", () => ({
  getStatsDClient: () => ({ increment: vi.fn(), distribution: vi.fn() }),
}));

vi.mock("@app/lib/api/elasticsearch", async () => {
  const { Ok } = await import("@app/types/shared/result");
  return {
    searchAnalytics: vi.fn().mockResolvedValue(
      new Ok({
        aggregations: { by_agent: { buckets: [] } },
      })
    ),
  };
});

import type { Authenticator } from "@app/lib/auth";
import {
  DEFAULT_MAX_AUTO_AGENTS_PER_RUN,
  DEFAULT_MAX_CONVERSATIONS_PER_AGENT,
  DEFAULT_MIN_CONVERSATIONS_TO_INCLUDE,
} from "@app/lib/reinforced_agent/constants";
import {
  type SelectionOptions,
  selectAgentsForReinforcementPipeline,
} from "@app/lib/reinforced_agent/selection";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import type { LightWorkspaceType } from "@app/types/user";

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const DEFAULT_PIPELINE_OPTIONS: SelectionOptions = {
  maxConversationsPerAgent: DEFAULT_MAX_CONVERSATIONS_PER_AGENT,
  maxAutoAgentsPerRun: DEFAULT_MAX_AUTO_AGENTS_PER_RUN,
  minConversationsToInclude: DEFAULT_MIN_CONVERSATIONS_TO_INCLUDE,
};

async function createConversationWithUpdatedAt(
  auth: Authenticator,
  agentId: string,
  updatedAt: Date
) {
  const conv = await ConversationFactory.create(auth, {
    agentConfigurationId: agentId,
    messagesCreatedAt: [updatedAt],
  });
  await ConversationFactory.setUpdatedAtForTest(auth, conv.id, updatedAt);
  return conv;
}

async function createAgentOnlyConversation(
  auth: Authenticator,
  workspace: LightWorkspaceType,
  agent: AgentConfigurationType,
  {
    updatedAt = new Date(),
    withFunctionCallStep = false,
  }: { updatedAt?: Date; withFunctionCallStep?: boolean } = {}
) {
  const conv = await ConversationFactory.create(auth, {
    agentConfigurationId: agent.sId,
    messagesCreatedAt: [],
  });
  await ConversationFactory.setUpdatedAtForTest(auth, conv.id, updatedAt);

  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation: conv,
    agentConfig: agent,
  });

  if (withFunctionCallStep) {
    await ConversationFactory.createFunctionCallStepForTest(
      auth,
      agentMessage.agentMessageId,
      { createdAt: updatedAt }
    );
  }

  return { conv, agentMessage };
}

async function addFeedback(
  workspace: LightWorkspaceType,
  userId: number,
  agent: AgentConfigurationType,
  conversationId: number,
  agentMessageId: number
) {
  return AgentMessageFeedbackResource.makeNew({
    workspaceId: workspace.id,
    agentConfigurationId: agent.sId,
    agentConfigurationVersion: agent.version,
    conversationId,
    agentMessageId,
    userId,
    thumbDirection: "up",
    content: "good",
    isConversationShared: false,
    dismissed: false,
  });
}

describe("selectAgentsForReinforcementPipeline", () => {
  let auth: Authenticator;
  let workspace: LightWorkspaceType;
  let userId: number;

  beforeEach(async () => {
    const setup = await createResourceTest({ role: "builder" });
    auth = setup.authenticator;
    workspace = setup.workspace;
    userId = setup.user.id;
  });

  it("returns empty array when agents list is empty", async () => {
    expect(
      await selectAgentsForReinforcementPipeline(
        auth,
        [],
        DEFAULT_PIPELINE_OPTIONS
      )
    ).toEqual([]);
  });

  it("excludes agents with reinforcement off", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const offAgent: LightAgentConfigurationType = {
      ...agent,
      reinforcement: "off",
    };
    expect(
      await selectAgentsForReinforcementPipeline(
        auth,
        [offAgent],
        DEFAULT_PIPELINE_OPTIONS
      )
    ).toEqual([]);
  });

  it("excludes global/system agents (id <= 0)", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const globalAgent: LightAgentConfigurationType = { ...agent, id: 0 };
    expect(
      await selectAgentsForReinforcementPipeline(
        auth,
        [globalAgent],
        DEFAULT_PIPELINE_OPTIONS
      )
    ).toEqual([]);
  });

  it("includes explicit-on agents at maxConversationsPerAgent without eligibility or scoring", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const onAgent: LightAgentConfigurationType = {
      ...agent,
      reinforcement: "on",
    };
    const results = await selectAgentsForReinforcementPipeline(
      auth,
      [onAgent],
      DEFAULT_PIPELINE_OPTIONS
    );
    expect(results).toEqual([
      {
        agentConfigurationId: onAgent.sId,
        conversationsToSample: DEFAULT_MAX_CONVERSATIONS_PER_AGENT,
      },
    ]);
  });

  it("explicit-on agents appear before auto agents in the output", async () => {
    const autoAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Auto Agent",
    });
    const onAgentBase = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "On Agent",
    });
    const onAgent: LightAgentConfigurationType = {
      ...onAgentBase,
      reinforcement: "on",
    };

    await Promise.all(
      Array.from({ length: DEFAULT_MIN_CONVERSATIONS_TO_INCLUDE }, () =>
        createConversationWithUpdatedAt(auth, autoAgent.sId, new Date())
      )
    );

    const { conv, agentMessage } = await createAgentOnlyConversation(
      auth,
      workspace,
      autoAgent
    );
    await addFeedback(
      workspace,
      userId,
      autoAgent,
      conv.id,
      agentMessage.agentMessageId
    );

    const results = await selectAgentsForReinforcementPipeline(
      auth,
      [autoAgent, onAgent],
      DEFAULT_PIPELINE_OPTIONS
    );

    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].agentConfigurationId).toBe(onAgent.sId);
  });

  it("maxAutoAgentsPerRun limits auto agents only, not explicit-on agents", async () => {
    const onAgentBase = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "On Agent Budget",
    });
    const onAgent: LightAgentConfigurationType = {
      ...onAgentBase,
      reinforcement: "on",
    };

    const autoAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Auto Agent Budget",
    });

    await Promise.all(
      Array.from({ length: DEFAULT_MIN_CONVERSATIONS_TO_INCLUDE }, () =>
        createConversationWithUpdatedAt(auth, autoAgent.sId, new Date())
      )
    );

    const { conv, agentMessage } = await createAgentOnlyConversation(
      auth,
      workspace,
      autoAgent
    );
    await addFeedback(
      workspace,
      userId,
      autoAgent,
      conv.id,
      agentMessage.agentMessageId
    );

    const results = await selectAgentsForReinforcementPipeline(
      auth,
      [onAgent, autoAgent],
      {
        ...DEFAULT_PIPELINE_OPTIONS,
        maxAutoAgentsPerRun: 1,
      }
    );

    expect(results).toHaveLength(2);
    expect(results[0].agentConfigurationId).toBe(onAgent.sId);
    expect(results[1].agentConfigurationId).toBe(autoAgent.sId);
  });

  it("excludes auto agent with only one human conversation and no feedback (insufficient signal)", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    await createConversationWithUpdatedAt(auth, agent.sId, new Date());

    const results = await selectAgentsForReinforcementPipeline(
      auth,
      [agent],
      DEFAULT_PIPELINE_OPTIONS
    );
    expect(results).toHaveLength(0);
  });

  it("excludes auto agent with tool calls but no human messages and no feedback", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    await createAgentOnlyConversation(auth, workspace, agent, {
      withFunctionCallStep: true,
    });

    const results = await selectAgentsForReinforcementPipeline(
      auth,
      [agent],
      DEFAULT_PIPELINE_OPTIONS
    );
    expect(results).toHaveLength(0);
  });

  it("includes auto agent that has feedback and sufficient human conversations", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    await Promise.all(
      Array.from({ length: DEFAULT_MIN_CONVERSATIONS_TO_INCLUDE }, () =>
        createConversationWithUpdatedAt(auth, agent.sId, new Date())
      )
    );

    const { conv: feedbackConv, agentMessage } =
      await createAgentOnlyConversation(auth, workspace, agent);
    await addFeedback(
      workspace,
      userId,
      agent,
      feedbackConv.id,
      agentMessage.agentMessageId
    );

    const results = await selectAgentsForReinforcementPipeline(
      auth,
      [agent],
      DEFAULT_PIPELINE_OPTIONS
    );
    expect(results).toHaveLength(1);
    expect(results[0].agentConfigurationId).toBe(agent.sId);
  });

  it("excludes auto agent with a recent pending reinforcement suggestion", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const { conv, agentMessage } = await createAgentOnlyConversation(
      auth,
      workspace,
      agent
    );
    await addFeedback(
      workspace,
      userId,
      agent,
      conv.id,
      agentMessage.agentMessageId
    );
    await AgentSuggestionFactory.createInstructions(auth, agent, {
      source: "reinforcement",
    });

    const results = await selectAgentsForReinforcementPipeline(
      auth,
      [agent],
      DEFAULT_PIPELINE_OPTIONS
    );
    expect(results).toHaveLength(0);
  });

  it("includes auto agent whose pending suggestion is older than the threshold", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    await Promise.all(
      Array.from({ length: DEFAULT_MIN_CONVERSATIONS_TO_INCLUDE }, () =>
        createConversationWithUpdatedAt(auth, agent.sId, new Date())
      )
    );

    const { conv, agentMessage } = await createAgentOnlyConversation(
      auth,
      workspace,
      agent
    );
    await addFeedback(
      workspace,
      userId,
      agent,
      conv.id,
      agentMessage.agentMessageId
    );
    const suggestion = await AgentSuggestionFactory.createInstructions(
      auth,
      agent,
      { source: "reinforcement" }
    );
    await AgentSuggestionFactory.setCreatedAt(suggestion, daysAgo(31));

    const results = await selectAgentsForReinforcementPipeline(
      auth,
      [agent],
      DEFAULT_PIPELINE_OPTIONS
    );
    expect(results).toHaveLength(1);
    expect(results[0].agentConfigurationId).toBe(agent.sId);
  });

  it("agent with more feedback receives a higher score and appears first", async () => {
    const agentA = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "High Feedback Agent",
    });
    const agentB = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Low Feedback Agent",
    });

    await Promise.all([
      ...Array.from({ length: DEFAULT_MIN_CONVERSATIONS_TO_INCLUDE }, () =>
        createConversationWithUpdatedAt(auth, agentA.sId, new Date())
      ),
      ...Array.from({ length: DEFAULT_MIN_CONVERSATIONS_TO_INCLUDE }, () =>
        createConversationWithUpdatedAt(auth, agentB.sId, new Date())
      ),
    ]);

    for (let i = 0; i < 3; i++) {
      const { conv, agentMessage } = await createAgentOnlyConversation(
        auth,
        workspace,
        agentA
      );
      await addFeedback(
        workspace,
        userId,
        agentA,
        conv.id,
        agentMessage.agentMessageId
      );
    }

    const { conv: convB, agentMessage: amB } =
      await createAgentOnlyConversation(auth, workspace, agentB);
    await addFeedback(workspace, userId, agentB, convB.id, amB.agentMessageId);

    const results = await selectAgentsForReinforcementPipeline(
      auth,
      [agentA, agentB],
      DEFAULT_PIPELINE_OPTIONS
    );

    expect(results).toHaveLength(2);
    expect(results[0].agentConfigurationId).toBe(agentA.sId);
    expect(results[1].agentConfigurationId).toBe(agentB.sId);
    expect(results[0].conversationsToSample).toBeGreaterThanOrEqual(
      results[1].conversationsToSample
    );
  });

  it("conversationsToSample does not exceed maxConversationsPerAgent", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    await Promise.all(
      Array.from({ length: 15 }, () =>
        createConversationWithUpdatedAt(auth, agent.sId, new Date())
      )
    );

    const { conv, agentMessage } = await createAgentOnlyConversation(
      auth,
      workspace,
      agent
    );
    await addFeedback(
      workspace,
      userId,
      agent,
      conv.id,
      agentMessage.agentMessageId
    );

    const results = await selectAgentsForReinforcementPipeline(auth, [agent], {
      ...DEFAULT_PIPELINE_OPTIONS,
      maxConversationsPerAgent: 10,
    });

    expect(results).toHaveLength(1);
    expect(results[0].conversationsToSample).toBeLessThanOrEqual(10);
  });

  it("drops agents whose unclamped allocation falls below minConversationsToInclude", async () => {
    const agentA = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Strong Signal Agent",
    });
    const agentB = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Weak Signal Agent",
    });

    await Promise.all(
      Array.from({ length: 4 }, () =>
        createConversationWithUpdatedAt(auth, agentA.sId, new Date())
      )
    );

    for (let i = 0; i < 3; i++) {
      const { conv, agentMessage } = await createAgentOnlyConversation(
        auth,
        workspace,
        agentA
      );
      await addFeedback(
        workspace,
        userId,
        agentA,
        conv.id,
        agentMessage.agentMessageId
      );
    }

    const { conv: convB, agentMessage: amB } =
      await createAgentOnlyConversation(auth, workspace, agentB);
    await addFeedback(workspace, userId, agentB, convB.id, amB.agentMessageId);

    const results = await selectAgentsForReinforcementPipeline(
      auth,
      [agentA, agentB],
      {
        maxConversationsPerAgent: 4,
        maxAutoAgentsPerRun: 2,
        totalAutoConversationPool: 8,
        minConversationsToInclude: 4,
      }
    );

    expect(results).toHaveLength(1);
    expect(results[0].agentConfigurationId).toBe(agentA.sId);
    expect(results[0].conversationsToSample).toBe(4);
  });
});
