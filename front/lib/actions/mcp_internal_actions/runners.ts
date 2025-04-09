import type { MCPToolResult } from "@app/lib/actions/mcp_actions";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { postUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import type { Authenticator } from "@app/lib/auth";
import type { UserMessageContext } from "@app/types";

export async function runAskAgent(
  auth: Authenticator,
  {
    agentId,
    query,
    context,
  }: {
    agentId: string;
    query: string;
    context: UserMessageContext;
  }
): Promise<MCPToolResult> {
  const agentConfiguration = await getAgentConfiguration(auth, agentId, "full");
  if (!agentConfiguration) {
    return makeMCPToolTextError("Failed to retrieve agent configuration.");
  }
  const conversation = await createConversation(auth, {
    title: `MCP Ask Agent - ${new Date().toISOString()}`,
    visibility: "unlisted",
  });
  const messageRes = await postUserMessageWithPubSub(
    auth,
    {
      conversation,
      content: query,
      mentions: [{ configurationId: agentId }],
      context,
    },
    { resolveAfterFullGeneration: true }
  );
  if (messageRes.isErr()) {
    return makeMCPToolTextError(
      `Error posting initial message: ${messageRes.error.api_error.message}`
    );
  }

  const { agentMessages } = messageRes.value;
  if (!agentMessages || agentMessages.length === 0) {
    return makeMCPToolTextError("No agent message returned.");
  }

  return {
    isError: false,
    content: [
      {
        type: "text",
        text: agentMessages[0].content?.trim() || "",
      },
    ],
  };
}
