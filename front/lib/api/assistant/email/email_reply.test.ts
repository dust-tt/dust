import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import {
  deleteEmailReplyContext,
  getEmailReplyContext,
  replyToEmail,
  sendToolValidationEmail,
  storeEmailReplyContext,
} from "@app/lib/api/assistant/email/email_trigger";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { getAgentLoopData } from "@app/types/assistant/agent_run";
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

vi.mock("@app/lib/auth", () => ({
  Authenticator: {
    fromJSON: vi.fn(),
  },
  getFeatureFlags: vi.fn(),
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
  getAgentLoopData: vi.fn(),
}));

import { sendEmailReplyOnCompletion } from "@app/lib/api/assistant/email/email_reply";

describe("sendEmailReplyOnCompletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(Authenticator.fromJSON).mockResolvedValue({
      isErr: () => false,
      value: {
        getNonNullableWorkspace: () => ({
          metadata: { allowEmailAgents: true },
        }),
      },
    } as never);
    vi.mocked(getFeatureFlags).mockResolvedValue(["email_agents"]);
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

    vi.mocked(getAgentLoopData).mockResolvedValue({
      isErr: () => false,
      value: {
        auth: {},
        agentMessage: {
          sId: "agent-message-1",
          content: "Done",
        },
        conversation: {
          sId: "conversation-1",
        },
      },
    } as never);

    await sendEmailReplyOnCompletion(
      { workspaceId: "workspace-1" } as never,
      {
        agentMessageId: "agent-message-1",
        userMessageOrigin: "email",
      } as never
    );

    expect(deleteEmailReplyContext).toHaveBeenCalledWith(
      "workspace-1",
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
});
