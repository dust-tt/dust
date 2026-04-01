import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/utils/statsd", () => ({
  getStatsDClient: () => ({ increment: vi.fn(), distribution: vi.fn() }),
}));

import type { Authenticator } from "@app/lib/auth";
import { filterEligibleAgents } from "@app/lib/reinforced_agent/eligibility";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { LightWorkspaceType } from "@app/types/user";

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000);

async function createConversationWithUpdatedAt(
  auth: Authenticator,
  agentSId: string,
  updatedAt: Date
) {
  const conv = await ConversationFactory.create(auth, {
    agentConfigurationId: agentSId,
    messagesCreatedAt: [updatedAt],
  });
  await ConversationFactory.setUpdatedAtForTest(auth, conv.id, updatedAt);
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

  it("includes agents with a recent human conversation and no pending suggestion", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    await createConversationWithUpdatedAt(auth, agent.sId, daysAgo(2));

    const result = await filterEligibleAgents(auth, [agent], 30);
    expect(result.map((a) => a.sId)).toEqual([agent.sId]);
  });

  it("excludes agents blocked by a recent pending suggestion", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    await createConversationWithUpdatedAt(auth, agent.sId, daysAgo(2));
    await AgentSuggestionFactory.createInstructions(auth, agent);

    const result = await filterEligibleAgents(auth, [agent], 30);
    expect(result).toEqual([]);
  });

  it("excludes agents whose conversations fall outside the lookback window", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    await createConversationWithUpdatedAt(auth, agent.sId, daysAgo(60));

    const result = await filterEligibleAgents(auth, [agent], 30);
    expect(result).toEqual([]);
  });

  it("includes agents with only recent function_call steps as signal", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
    const { agentMessage } = await ConversationFactory.createAgentMessage(
      auth,
      { workspace, conversation, agentConfig: agent }
    );

    const recent = daysAgo(2);
    await ConversationFactory.createFunctionCallStepForTest(
      auth,
      agentMessage.agentMessageId,
      { createdAt: recent }
    );

    const result = await filterEligibleAgents(auth, [agent], 30);
    expect(result.map((a) => a.sId)).toEqual([agent.sId]);
  });
});
