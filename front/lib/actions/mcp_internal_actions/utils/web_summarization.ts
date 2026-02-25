import type { AgentLoopRunContextType } from "@app/lib/actions/types";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getFastModelConfig } from "@app/lib/api/assistant/global_agents/configurations/dust/deep-dive";
import type { Authenticator } from "@app/lib/auth";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const MAX_CHARACTERS_TO_SUMMARIZE = 100_000;
const browserSummaryAgentInstructions = `<primary_goal>
You are a web page summary agent. Your primary role is to summarize web page content.
You are provided with a web page content and you must produce a high quality comprehensive summary of the content.
Your goal is to remove the noise without altering meaning or removing important information. You may use a bullet-points-heavy format.
Provide URLs for sub-pages that that are relevant to the summary.
</primary_goal>`;

/**
 * Uses a direct LLM call via runMultiActionsAgent.
 * This avoids creating a conversation and streaming through the Dust API, instead making a direct
 * LLM call for faster summarization.
 */
export async function summarizeWithLLM({
  auth,
  content,
  agentLoopRunContext,
}: {
  auth: Authenticator;
  content: string;
  agentLoopRunContext: AgentLoopRunContextType;
}): Promise<Result<string, Error>> {
  const owner = auth.getNonNullableWorkspace();
  const toSummarize = content.slice(0, MAX_CHARACTERS_TO_SUMMARIZE);

  const model = getFastModelConfig(owner);
  if (!model) {
    return new Err(
      new Error("Failed to find a whitelisted model to generate summary")
    );
  }

  const conversation: ModelConversationTypeMultiActions = {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Summarize the following web page content.\n\n${toSummarize}`,
          },
        ],
        name: "",
      },
    ],
  };

  const res = await runMultiActionsAgent(
    auth,
    {
      providerId: model.providerId,
      modelId: model.modelId,
      functionCall: null, // No function call needed, just text generation
      temperature: 0.3,
      useCache: false,
    },
    {
      conversation,
      prompt: browserSummaryAgentInstructions,
      specifications: [], // No tools needed for simple summarization
    },
    {
      context: {
        operationType: "web_content_summarization",
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
        ...(agentLoopRunContext && {
          conversationId: agentLoopRunContext.conversation.sId,
        }),
      },
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  const summary = res.value.generation?.trim();
  if (!summary) {
    return new Err(new Error("LLM returned empty summary"));
  }

  return new Ok(summary);
}
