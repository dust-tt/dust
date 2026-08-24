import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { renderConversationAsText } from "@app/lib/api/assistant/conversation/render_as_text";
import { getFastestWhitelistedModel } from "@app/lib/api/assistant/models";
import type { Authenticator } from "@app/lib/auth";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const FUNCTION_NAME = "summarize_progress";

const specifications: AgentActionSpecification[] = [
  {
    name: FUNCTION_NAME,
    description: "Summarize the progress made so far in the conversation",
    inputSchema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description:
            "A short summary, addressed directly to the user, of what has " +
            "been accomplished so far and a note that the process was stopped early to " +
            "conserve credits.",
        },
      },
      required: ["summary"],
    },
  },
];

/**
 * Generates a short, user-facing summary of progress so far, for the smooth shutdown flow:
 * the agent loop stops cooperatively before its normal completion (credit threshold reached),
 * and this replaces the missing final answer with a one-shot summary of what was done.
 *
 * Deliberately a single lightweight model call outside the normal agent loop (no tools, no
 * additional agent step) rather than another full agent turn.
 */
export async function generateSmoothShutdownSummary(
  auth: Authenticator,
  conversation: ConversationType
): Promise<Result<string, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const model = getFastestWhitelistedModel(auth);
  if (!model) {
    return new Err(
      new Error("Failed to find a whitelisted model to generate summary")
    );
  }

  const conv: ModelConversationTypeMultiActions = {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Here is the conversation so far.\n\n${renderConversationAsText(conversation, { includeTimestamps: true })}`,
          },
        ],
        name: "",
      },
    ],
  };

  if (conv.messages.length === 0) {
    return new Err(
      new Error(
        "Error generating smooth shutdown summary: rendered conversation is empty"
      )
    );
  }

  const res = await runMultiActionsAgent(
    auth,
    {
      providerId: model.providerId,
      modelId: model.modelId,
      functionCall: FUNCTION_NAME,
      useCache: false,
    },
    {
      conversation: conv,
      prompt:
        "The agent's process is being stopped early because the workspace's credit " +
        "threshold was reached. Summarize what has been accomplished so far for the user.",
      specifications,
      forceToolCall: FUNCTION_NAME,
    },
    {
      context: {
        operationType: "smooth_shutdown_summary",
        conversationId: conversation.sId,
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  if (res.value.actions?.[0]?.arguments?.summary) {
    return new Ok(res.value.actions[0].arguments.summary);
  }

  return new Err(new Error("No summary found in LLM response"));
}
