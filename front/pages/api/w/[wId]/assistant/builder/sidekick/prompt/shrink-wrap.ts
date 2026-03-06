import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { getShrinkWrapedConversation } from "@app/lib/api/assistant/conversation/shrink_wrap";
import { fetchLangfuseFirstMessagePrompt } from "@app/lib/api/assistant/global_agents/langfuse_prompts";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import { ConversationError } from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export function buildFirstMessage(shrinkWrappedConversation: string): string {
  return `<dust_system>
Your task is to analyze the conversation below and suggest a configuration for a new agent
that can replicate its workflow with different inputs.

Think of it as distilling a multi-turn conversation into an efficient, single-execution agent.

Read the conversation timeline chronologically. The final messages best reflect the user's true
intent — when users refined mid-conversation ("actually do X", "also add Y", "change the format"),
the new agent must handle the FULL final scope, not intermediate states.

Identify:
- Primary use case: What problem is ultimately being solved? (look at the final output)
- Required parameters: What INPUTS varied or were provided across the conversation?
- Required capabilities: What tools, skills, or data sources were invoked?

<conversation_data>
The conversation is a chronological timeline: each message has an index, sId, sender (user or
agent name), actions (tool invocations), and content.
- If content ismarked "(truncated)", call \`inspect_message\` only if you need the full content.
- Call \`inspect_message\` when you need the exact argument shape for a tool (e.g. query,
  childAgent.uri, filters) to write generalized instructions — extract the shape, not literal values.
- Never call \`inspect_message\` speculatively on every message, on user messages unless truncated,
  or on simple text-only responses.
</conversation_data>

<sub-agent_handling>
If \`inspect_conversation\` returns a \`childConversationId\` in any action and it is relevant to the final output, call
\`inspect_conversation\` on that child before deciding whether you need \`inspect_message\`
on any of its messages. Do NOT duplicate sub-agent logic via instruction suggestions — prefer to reuse existing
agents via sub-agent configuration.
</sub-agent_handling>

<generalizing>
It is imperative you refer to <generalization_over_examples> to avoid hardcoding literal values.
When users iterated on a conversation output (e.g., changed topic, added constraint, refined format), the final agent
should gather ALL parameters that were eventually needed — not branch conditionally on them.

Example:
- Conversation: "write poem about flowers" → "actually mountains" → "include the word 'door'"
- WRONG: conditionals for each refinement
- RIGHT: "Gather the poem topic and any specific words to include. Write a poem incorporating those."
</generalizing>

<identifying_knowledge_sources>
Step 1 — Scan \`inspect_conversation\` for knowledge-access actions. Look for tool names:
- \`semantic_search\`, \`retrieve_recent_documents\` → data source search (server: \`search\`)
- \`cat\`, \`find\`, \`list\`, \`locate_in_tree\` → filesystem browsing (server: \`data_sources_file_system\`)
- \`query_tables\`, \`get_database_schema\` → table/SQL access
- \`run_agent\` → sub-agent (inspect child conversation separately)

Step 2 — Call \`inspect_message\` on those specific messages. In the tool call Input JSON, look for:
- \`dataSources[].uri\` — exact data source URI (most reliable)
- \`query\` — what was retrieved (use to explain WHY to recommend the source)

Step 3 — Corroborate with citations. \`:cite[ref]\` directives in agent responses confirm which
sources were actually used. Prioritize sources that appear in both tool inputs AND citations.

Step 4 — Recommend with context, never auto-add. For each source, suggest it with a one-line
reason tied to its role: e.g. "Notion: used to retrieve project briefs for the report".
</identifying_knowledge_sources>

<mapping_to_suggestions>
- Tools/Skills: Suggest based on the Actions list in the conversation.
- Knowledge: Follow <identifying_knowledge_sources>; one-line reason per source, never auto-add.
</mapping_to_suggestions>

Here is the conversation to analyze:

<conversation>
${shrinkWrappedConversation}
</conversation>

Before suggesting agent instructions, confirm your understanding:
- Goal: What problem this agent solves
- Inputs: What parameters/data users will provide
- Outputs: What the agent will produce

Unless the conversation is very short and unambiguous, wait for confirmation before generating
the full suggestion set.
</dust_system>`;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<string>>,
  auth: Authenticator
): Promise<void> {
  const { conversationId } = req.query;

  if (!isString(conversationId)) {
    return apiError(req, res, {
      status_code: 422,
      api_error: {
        type: "unprocessable_entity",
        message: `The conversationId query parameter is invalid or missing.`,
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const { copilotEdge } = req.query;
      const conversationRes = await getShrinkWrapedConversation(auth, {
        conversationId,
      });

      if (conversationRes.isErr()) {
        // Distinguish between "not found" and "access restricted" for the UI.
        const canAccess = await ConversationResource.canAccess(
          auth,
          conversationId
        );
        const error =
          canAccess === "conversation_access_restricted"
            ? new ConversationError("conversation_access_restricted")
            : conversationRes.error;
        return apiErrorForConversation(req, res, error);
      }

      if (copilotEdge !== "true") {
        return res
          .status(200)
          .json(buildFirstMessage(conversationRes.value.text));
      }

      const result = await fetchLangfuseFirstMessagePrompt(
        "copilot-edge-first-message-shrink-wrap",
        { conversation: conversationRes.value.text }
      );
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to generate copilot prompt.",
          },
        });
      }

      return res.status(200).json(result.value);
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
