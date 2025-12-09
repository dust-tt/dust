import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { isLLMTraceId } from "@app/lib/api/llm/traces/buffer";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { getDustProdAction } from "@app/lib/registry";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type {
  ConversationError,
  ModelId,
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
    const multiActionsApp = getDustProdAction(
      "assistant-v2-multi-actions-agent"
    );

    // Cycle through the message and actions and enrich them with the runId(s) and timestamps
    for (const messages of pokeConversation.content) {
      for (const m of messages) {
        if (m.type === "agent_message") {
          const runIds = (
            await AgentMessageModel.findOne({
              where: {
                id: m.agentMessageId,
                workspaceId: owner.id,
              },
              attributes: ["runIds"],
              raw: true,
            })
          )?.runIds;

          m.runIds = runIds;

          // Generate URLs for runIds.
          if (runIds) {
            m.runUrls = runIds.map((runId) => {
              const isLLM = isLLMTraceId(runId);
              const url = isLLM
                ? `/poke/${owner.sId}/llm-traces/${runId}`
                : `/w/${multiActionsApp.app.workspaceId}/spaces/${multiActionsApp.app.appSpaceId}/apps/${multiActionsApp.app.appId}/runs/${runId}`;

              return { runId, url, isLLM };
            });
          }

          if (m.actions.length > 0) {
            // Fetch timestamps for actions
            const actionIds: ModelId[] = m.actions.map((a) => a.id);
            const actionsWithTimestamps =
              await AgentMCPActionResource.fetchByModelIds(auth, actionIds);
            const timestampMap = new Map(
              actionsWithTimestamps.map((action) => [
                action.id,
                action.createdAt.getTime(),
              ])
            );

            for (const a of m.actions) {
              a.mcpIO = {
                params: a.params,
                output: a.output,
                generatedFiles: a.generatedFiles,
                isError: a.status === "errored",
              };
              // Add timestamp if available
              const timestamp = timestampMap.get(a.id);
              if (timestamp) {
                a.created = timestamp;
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
