import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import {
  buildAgentMessageCreditsBreakdownFromConsumptionAnalytics,
  fetchAgentMessageConsumptionAnalyticsByMessageIds,
} from "@app/lib/api/assistant/credit_cost";
import { isLLMTraceId } from "@app/lib/api/llm/traces/buffer";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import type { ConversationError } from "@app/types/assistant/conversation";
import type {
  PokeAgentMessageType,
  PokeConversationType,
} from "@app/types/poke";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

export async function getPokeConversation(
  auth: Authenticator,
  conversationId: string,
  includeDeleted?: boolean
): Promise<Result<PokeConversationType, ConversationError>> {
  const owner = auth.getNonNullableWorkspace();
  // biome-ignore lint/plugin/noExpensiveConversationFetch: intentional full conversation load
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

    const agentMessages = pokeConversation.content
      .flat()
      .filter((m): m is PokeAgentMessageType => m.type === "agent_message");

    const agentMessagesWithRunIds = await AgentMessageModel.findAll({
      where: {
        id: [...new Set(agentMessages.map((m) => m.agentMessageId))],
        workspaceId: owner.id,
      },
      attributes: ["id", "runIds"],
    });
    const runIdsByAgentMessageId = new Map(
      agentMessagesWithRunIds.map((m) => [m.id, m.runIds])
    );

    // Batch-fetch the stored consumption analytics documents for every agent message in the
    // conversation so each message's cost breakdown can be attached with no per-message query.
    const consumptionAnalyticsByMessageId =
      await fetchAgentMessageConsumptionAnalyticsByMessageIds(auth, {
        messageIds: agentMessages.map((m) => m.sId),
      });

    // Cycle through the messages and actions and enrich them with runId(s) and timestamps.
    for (const messages of pokeConversation.content) {
      for (const m of messages) {
        if (m.type === "agent_message") {
          const runIds = runIdsByAgentMessageId.get(m.agentMessageId) ?? null;

          m.runIds = runIds;

          // Generate URLs for runIds.
          if (runIds) {
            m.runUrls = runIds.map((runId) => {
              const isLLM = isLLMTraceId(runId);
              const url = `/poke/${owner.sId}/llm-traces/${runId}`;
              return { runId, url, isLLM };
            });
          }

          if (m.actions.length > 0) {
            for (const a of m.actions) {
              a.mcpIO = {
                params: a.params,
                output: a.output,
                generatedFiles: a.generatedFiles,
                isError: a.status === "errored",
              };
              a.created = a.createdAt;
            }
          }

          m.costBreakdown =
            buildAgentMessageCreditsBreakdownFromConsumptionAnalytics({
              documents: consumptionAnalyticsByMessageId.get(m.sId),
              actions: m.actions.map((a) => ({
                actionId: a.sId,
                toolName: a.toolName,
                internalMCPServerName: a.internalMCPServerName,
                status: a.status,
              })),
            });
        }
      }
    }
    return new Ok(pokeConversation);
  }

  return conversation;
}
