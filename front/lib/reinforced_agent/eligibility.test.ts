import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/utils/statsd", () => ({
  getStatsDClient: () => ({ increment: vi.fn(), distribution: vi.fn() }),
}));

import type { Authenticator } from "@app/lib/auth";
import { DEFAULT_PENDING_SUGGESTION_MAX_AGE_DAYS } from "@app/lib/reinforced_agent/constants";
import { filterEligibleAgents } from "@app/lib/reinforced_agent/eligibility";
import {
  fetchReinforcementAutoTrackSignals,
  type ReinforcementAutoTrackSignals,
} from "@app/lib/reinforced_agent/signals";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { LightWorkspaceType } from "@app/types/user";

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000);

function emptySignals(): ReinforcementAutoTrackSignals {
  return {
    feedbackCountByAgentId: new Map(),
    humanConversationSIdsByAgent: new Map(),
    agentIdsWithRecentPendingSuggestions: new Set(),
  };
}

async function createHumanInLoopConversation(
  auth: Authenticator,
  agent: LightAgentConfigurationType,
  messageDate: Date
) {
  const conv = await ConversationFactory.create(auth, {
    agentConfigurationId: agent.sId,
    messagesCreatedAt: [messageDate],
    visibility: "unlisted",
  });
  await ConversationFactory.setUpdatedAtForTest(auth, conv.id, messageDate);
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

  it("returns empty array when agents list is empty", () => {
    expect(filterEligibleAgents(auth, [], emptySignals())).toEqual([]);
  });

  it("excludes agents with reinforcement off before using signals payload", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const withOff: LightAgentConfigurationType = {
      ...agent,
      reinforcement: "off",
    };
    expect(filterEligibleAgents(auth, [withOff], emptySignals())).toEqual([]);
  });

  it("excludes agents with non-positive id before using signals payload", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const withBadId: LightAgentConfigurationType = { ...agent, id: 0 };
    expect(filterEligibleAgents(auth, [withBadId], emptySignals())).toEqual([]);
  });

  it("includes agents with a recent human-in-the-loop conversation", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    await createHumanInLoopConversation(auth, agent, daysAgo(2));

    const signals = await fetchReinforcementAutoTrackSignals(auth, {
      agentIds: [agent.sId],
      lookbackWindowDays: 30,
      pendingSuggestionMaxAgeDays: DEFAULT_PENDING_SUGGESTION_MAX_AGE_DAYS,
    });

    const result = filterEligibleAgents(auth, [agent], signals);
    expect(result.map((a) => a.sId)).toEqual([agent.sId]);
  });

  it("includes agents with feedback even without a human-in-the-loop conversation", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const conv = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
    const { agentMessage } = await ConversationFactory.createAgentMessage(
      auth,
      {
        workspace,
        conversation: conv,
        agentConfig: agent,
      }
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

    const signals = await fetchReinforcementAutoTrackSignals(auth, {
      agentIds: [agent.sId],
      lookbackWindowDays: 30,
      pendingSuggestionMaxAgeDays: DEFAULT_PENDING_SUGGESTION_MAX_AGE_DAYS,
    });

    const result = filterEligibleAgents(auth, [agent], signals);
    expect(result.map((a) => a.sId)).toEqual([agent.sId]);
  });

  it("excludes agents blocked by a recent pending suggestion", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    await createHumanInLoopConversation(auth, agent, daysAgo(2));
    await AgentSuggestionFactory.createInstructions(auth, agent, {
      source: "reinforcement",
    });

    const signals = await fetchReinforcementAutoTrackSignals(auth, {
      agentIds: [agent.sId],
      lookbackWindowDays: 30,
      pendingSuggestionMaxAgeDays: DEFAULT_PENDING_SUGGESTION_MAX_AGE_DAYS,
    });

    const result = filterEligibleAgents(auth, [agent], signals);
    expect(result).toEqual([]);
  });

  it("excludes agents whose human-in-the-loop activity falls outside the lookback window", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    await createHumanInLoopConversation(auth, agent, daysAgo(60));

    const signals = await fetchReinforcementAutoTrackSignals(auth, {
      agentIds: [agent.sId],
      lookbackWindowDays: 30,
      pendingSuggestionMaxAgeDays: DEFAULT_PENDING_SUGGESTION_MAX_AGE_DAYS,
    });

    const result = filterEligibleAgents(auth, [agent], signals);
    expect(result).toEqual([]);
  });
});
