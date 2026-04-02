import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/utils/statsd", () => ({
  getStatsDClient: () => ({ increment: vi.fn(), distribution: vi.fn() }),
}));

import type { Authenticator } from "@app/lib/auth";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { filterEligibleAgents } from "@app/lib/reinforced_agent/eligibility";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { LightWorkspaceType } from "@app/types/user";

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000);

async function createRecentAgentMessage(
  auth: Authenticator,
  workspace: LightWorkspaceType,
  agent: LightAgentConfigurationType,
  agentMessageCreatedAt: Date
) {
  const conv = await ConversationFactory.create(auth, {
    agentConfigurationId: agent.sId,
    messagesCreatedAt: [],
    visibility: "unlisted",
  });
  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation: conv,
    agentConfig: agent,
  });
  await AgentMessageModel.update(
    { createdAt: agentMessageCreatedAt },
    { where: { workspaceId: workspace.id, id: agentMessage.agentMessageId } }
  );
  return conv;
}

describe("filterEligibleAgents", () => {
  let auth: Authenticator;
  let workspace: LightWorkspaceType;

  beforeEach(async () => {
    const setup = await createResourceTest({ role: "builder" });
    auth = setup.authenticator;
    workspace = setup.workspace;
  });

  it("returns empty array when agents list is empty", async () => {
    expect(await filterEligibleAgents(auth, [], 30)).toEqual([]);
  });

  it("excludes agents with reinforcement off before any DB queries", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const withOff: LightAgentConfigurationType = {
      ...agent,
      reinforcement: "off",
    };
    expect(await filterEligibleAgents(auth, [withOff], 30)).toEqual([]);
  });

  it("excludes agents with non-positive id before any DB queries", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const withBadId: LightAgentConfigurationType = { ...agent, id: 0 };
    expect(await filterEligibleAgents(auth, [withBadId], 30)).toEqual([]);
  });

  it("includes agents with a recent agent message", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    await createRecentAgentMessage(auth, workspace, agent, daysAgo(2));

    const result = await filterEligibleAgents(auth, [agent], 30);
    expect(result.map((a) => a.sId)).toEqual([agent.sId]);
  });

  it("includes agents with feedback even without a recent agent message", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const conv = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
    const { agentMessage } = await ConversationFactory.createAgentMessage(
      auth,
      { workspace, conversation: conv, agentConfig: agent }
    );
    await AgentMessageFeedbackResource.makeNew({
      workspaceId: auth.getNonNullableWorkspace().id,
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: 0,
      agentMessageId: agentMessage.agentMessageId,
      userId: auth.getNonNullableUser().id,
      conversationId: conv.id,
      thumbDirection: "up",
      content: null,
      isConversationShared: false,
      dismissed: false,
    });

    const result = await filterEligibleAgents(auth, [agent], 30);
    expect(result.map((a) => a.sId)).toEqual([agent.sId]);
  });

  it("excludes agents blocked by a recent pending suggestion", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    await createRecentAgentMessage(auth, workspace, agent, daysAgo(2));
    await AgentSuggestionFactory.createInstructions(auth, agent);

    const result = await filterEligibleAgents(auth, [agent], 30);
    expect(result).toEqual([]);
  });

  it("excludes agents whose agent messages fall outside the lookback window", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    await createRecentAgentMessage(auth, workspace, agent, daysAgo(60));

    const result = await filterEligibleAgents(auth, [agent], 30);
    expect(result).toEqual([]);
  });
});
