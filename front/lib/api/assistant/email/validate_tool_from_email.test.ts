import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/redis-hybrid-manager", () => ({
  getRedisHybridManager: vi.fn().mockReturnValue({
    removeEvent: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn().mockResolvedValue(undefined),
}));

import { validateActionFromEmail } from "@app/lib/api/assistant/email/validate_tool_from_email";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";

describe("validateActionFromEmail", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    vi.clearAllMocks();

    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
  });

  it.each([
    "interrupted",
    "gracefully_stopped",
  ] as const)("rejects resolving an action whose agent message is %s", async (status) => {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });
    const userMessageRow = await ConversationFactory.createUserMessageWithRank({
      auth,
      workspace,
      conversationId: conversation.id,
      rank: 0,
      content: "Test message",
    });
    const messageRow = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conversation.id,
      rank: 1,
      agentConfigurationId: agentConfig.sId,
      agentConfigurationVersion: agentConfig.version,
      parentId: userMessageRow.id,
    });
    const { action } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: messageRow.agentMessageId!,
    });

    await ConversationFactory.setAgentMessageStatus({
      workspace,
      agentMessageModelId: messageRow.agentMessageId!,
      status,
    });

    const result = await validateActionFromEmail(auth, {
      actionId: action.sId,
      approvalState: "approved",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("action_not_blocked");
    }

    const reloadedAction = await AgentMCPActionResource.fetchById(
      auth,
      action.sId
    );
    expect(reloadedAction?.status).toBe("blocked_validation_required");
    expect(launchAgentLoopWorkflow).not.toHaveBeenCalled();
  });
});
