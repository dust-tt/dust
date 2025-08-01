import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import type {
  ConversationError,
  PokeConversationType,
  Result,
} from "@app/types";
import { Ok } from "@app/types";

export async function getPokeConversation(
  auth: Authenticator,
  conversationId: string,
  includeDeleted?: boolean
): Promise<Result<PokeConversationType, ConversationError>> {
  const owner = auth.getNonNullableWorkspace();
  const conversation = await getConversation(
    auth,
    conversationId,
    includeDeleted
  );

  // Enrich the returned conversation with the apps runs linked to the agent messages
  // Decided to do it as a separate step because I didn't want to modify the getConversation to make it more complex based on the use case
  // and I still wanted to use the existing getConversation code for rendering.
  if (conversation.isOk()) {
    const pokeConversation = conversation.value as PokeConversationType;
    // Cycle through the message and actions and enrich them with the runId(s)
    for (const messages of pokeConversation.content) {
      for (const m of messages) {
        if (m.type === "agent_message") {
          m.runIds = (
            await AgentMessage.findOne({
              where: {
                id: m.agentMessageId,
                workspaceId: owner.id,
              },
              attributes: ["runIds"],
              raw: true,
            })
          )?.runIds;

          if (m.actions.length > 0) {
            {
              for (const a of m.actions) {
                a.mcpIO = {
                  params: a.params,
                  output: a.output,
                  generatedFiles: a.generatedFiles,
                  isError: a.isError,
                };
              }
            }
          }
        }
      }
    }
    return new Ok(pokeConversation);
  }

  return conversation;
}
