import type { Authenticator } from "@app/lib/auth";
import { ConversationMCPServerViewModel } from "@app/lib/models/agent/actions/conversation_mcp_server_view";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import assert from "assert";

export class ConversationMCPServerViewFactory {
  static async create(
    auth: Authenticator,
    {
      conversation,
      mcpServerViewId,
      enabled = true,
      source,
      agentConfigurationId = null,
    }: {
      conversation: ConversationWithoutContentType;
      mcpServerViewId: number;
      enabled?: boolean;
      source: "agent_enabled" | "conversation";
      agentConfigurationId?: string | null;
    }
  ) {
    const user = auth.user();
    assert(user, "User is required");

    return ConversationMCPServerViewModel.create({
      workspaceId: auth.getNonNullableWorkspace().id,
      conversationId: conversation.id,
      mcpServerViewId,
      userId: user.id,
      enabled,
      source,
      agentConfigurationId,
    });
  }
}
