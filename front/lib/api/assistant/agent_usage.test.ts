import { describe, expect, it } from "vitest";

import { agentMentionsCount } from "@app/lib/api/assistant/agent_usage";
import { Mention } from "@app/lib/models/agent/conversation";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";

process.env.FRONT_DATABASE_READ_REPLICA_URI =
  process.env.FRONT_DATABASE_URI ?? process.env.TEST_FRONT_DATABASE_URI;

describe("agentMentionsCount", () => {
  it("should only count agent mentions, not user mentions", async () => {
    const { workspace, authenticator: auth } = await createResourceTest({});

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test agent for mention counting",
    });

    // Create conversation with message
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
    });

    const { messageRow } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Test message",
    });

    // Create AGENT mention (agentConfigurationId NOT NULL)
    await Mention.create({
      workspaceId: workspace.id,
      messageId: messageRow.id,
      agentConfigurationId: agentConfig.sId,
      userId: null,
    });

    // Create USER mention (agentConfigurationId IS NULL)
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    await Mention.create({
      workspaceId: workspace.id,
      messageId: messageRow.id,
      agentConfigurationId: null,
      userId: user.id,
    });

    // Query should only return agent mention
    const result = await agentMentionsCount(workspace.id);

    expect(result).toHaveLength(1);
    expect(result[0].agentId).toBe(agentConfig.sId);
    expect(result[0].messageCount).toBe(1); // Only agent mention, not user mention
  });
});
