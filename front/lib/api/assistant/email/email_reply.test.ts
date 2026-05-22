import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import {
  deleteEmailReplyContext,
  getEmailReplyContext,
  replyToEmail,
  sendToolValidationEmail,
  storeEmailReplyContext,
} from "@app/lib/api/assistant/email/email_trigger";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { getAgentLoopDataWithAuth } from "@app/types/assistant/agent_run";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/configuration/agent", () => ({
  getAgentConfiguration: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/email/email_trigger", () => ({
  deleteEmailReplyContext: vi.fn(),
  getEmailReplyContext: vi.fn(),
  replyToEmail: vi.fn(),
  sendToolValidationEmail: vi.fn(),
  storeEmailReplyContext: vi.fn(),
}));

vi.mock("@app/lib/api/config", () => ({
  default: {
    getAppUrl: vi.fn(() => "https://app.dust.tt"),
  },
}));

vi.mock("@app/lib/resources/agent_mcp_action_resource", () => ({
  AgentMCPActionResource: {
    listBlockedActionsForConversation: vi.fn(),
  },
}));

vi.mock("@app/lib/resources/conversation_resource", () => ({
  ConversationResource: {
    fetchById: vi.fn(),
  },
}));

vi.mock("@app/lib/utils/router", () => ({
  getConversationRoute: vi.fn(() => "https://app.dust.tt/conv"),
}));

vi.mock("@app/types/assistant/agent_run", () => ({
  getAgentLoopDataWithAuth: vi.fn(),
}));

import { sendEmailReplyOnCompletion } from "@app/lib/api/assistant/email/email_reply";

describe("sendEmailReplyOnCompletion", () => {
  async function makeAuth({ allowEmailAgents }: { allowEmailAgents: boolean }) {
    const workspace = await WorkspaceFactory.basic();
    const updateResult = await WorkspaceResource.updateMetadata(workspace.id, {
      allowEmailAgents,
    });
    expect(updateResult.isOk()).toBe(true);

    return Authenticator.internalAdminForWorkspace(workspace.sId);
  }

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(ConversationResource.fetchById).mockResolvedValue({} as never);
    vi.mocked(
      AgentMCPActionResource.listBlockedActionsForConversation
    ).mockResolvedValue([]);
    vi.mocked(getAgentConfiguration).mockResolvedValue(null);
  });

  it("replies only to the sender even when the stored context contains legacy reply-all fields", async () => {
    vi.mocked(getEmailReplyContext).mockResolvedValue({
      subject: "Test",
      originalText: "Hello",
      fromEmail: "sender@dust.tt",
      fromFull: "Sender <sender@dust.tt>",
      threadingMessageId: "<incoming-message-id@dust.tt>",
      threadingInReplyTo: null,
      threadingReferences: null,
      agentConfigurationId: "agent-config-1",
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      replyTo: ["sender@dust.tt", "observer@dust.tt"],
      replyCc: ["security@dust.tt"],
    } as never);

    vi.mocked(getAgentLoopDataWithAuth).mockResolvedValue({
      isErr: () => false,
      value: {
        agentMessage: {
          sId: "agent-message-1",
          content: "Done",
        },
        conversation: {
          sId: "conversation-1",
        },
      },
    } as never);

    const auth = await makeAuth({ allowEmailAgents: true });

    await sendEmailReplyOnCompletion(auth, {
      agentMessageId: "agent-message-1",
      userMessageOrigin: "email",
    } as never);

    expect(deleteEmailReplyContext).toHaveBeenCalledWith(
      auth.getNonNullableWorkspace().sId,
      "agent-message-1"
    );
    expect(replyToEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: "sender@dust.tt",
      })
    );
    expect(replyToEmail).toHaveBeenCalledTimes(1);
    expect(sendToolValidationEmail).not.toHaveBeenCalled();
    expect(storeEmailReplyContext).not.toHaveBeenCalled();
  });

  it("skips the reply when email agents are disabled in workspace metadata", async () => {
    vi.mocked(getEmailReplyContext).mockResolvedValue({
      subject: "Test",
      originalText: "Hello",
      fromEmail: "sender@dust.tt",
      fromFull: "Sender <sender@dust.tt>",
      threadingMessageId: "<incoming-message-id@dust.tt>",
      threadingInReplyTo: null,
      threadingReferences: null,
      agentConfigurationId: "agent-config-1",
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
    } as never);
    vi.mocked(getAgentLoopDataWithAuth).mockResolvedValue({
      isErr: () => false,
      value: {
        agentMessage: {
          sId: "agent-message-1",
          content: "Done",
        },
        conversation: {
          sId: "conversation-1",
        },
      },
    } as never);

    const auth = await makeAuth({ allowEmailAgents: false });

    await sendEmailReplyOnCompletion(auth, {
      agentMessageId: "agent-message-1",
      userMessageOrigin: "email",
    } as never);

    expect(deleteEmailReplyContext).toHaveBeenCalledWith(
      auth.getNonNullableWorkspace().sId,
      "agent-message-1"
    );
    expect(replyToEmail).not.toHaveBeenCalled();
    expect(sendToolValidationEmail).not.toHaveBeenCalled();
  });
});
