import { Authenticator } from "@app/lib/auth";
import { listRecentConversationsForAgent } from "@app/lib/reinforced_agent/utils";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import {  describe, expect, it, vi } from "vitest";

vi.mock(import("../api/redis"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    runOnRedis: vi.fn().mockImplementation((_, fn) =>
      fn({
        zAdd: vi.fn().mockResolvedValue(undefined),
        expire: vi.fn().mockResolvedValue(undefined),
      })
    ),
  };
});

describe("listRecentConversationsForAgent", () => {
  it("should return conversations from a personal project", async () => {
    const { workspace, user } = await createResourceTest({
      role: "admin",
    });

    // Create a project
    const projectSpace = await SpaceFactory.project(workspace, user.id);

    // Refresh user auth after space membership change.
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    // Create a test agent.
    const agent = await AgentConfigurationFactory.createTestAgent(userAuth, {
      name: "Test Agent",
      scope: "hidden",
    });

    // Create a conversation inside the project space.
    await ConversationFactory.create(userAuth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date()],
      spaceId: projectSpace.id,
    });

    const results = await listRecentConversationsForAgent(workspace.sId, {
      agentConfigurationId: agent.sId,
      conversationLookbackDays: 1,
    });

    expect(results).toHaveLength(1);
  });
});
