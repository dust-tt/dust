import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { SuggestionResults } from "@app/lib/api/assistant/suggestions/types";
import type { Authenticator } from "@app/lib/auth";
import type { BuilderSuggestionInputType } from "@app/types/api/internal/assistant";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import { GPT_3_5_TURBO_MODEL_ID } from "@app/types/assistant/models/openai";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const FUNCTION_NAME = "send_suggestion";

const specifications: AgentActionSpecification[] = [
  {
    name: FUNCTION_NAME,
    description: "Send a suggestion of description for the agent",
    inputSchema: {
      type: "object",
      properties: {
        suggestion: {
          type: "string",
          description:
            "A description of the agent using 1 short sentence. Be factual, clear and concise. " +
            "Do not use more than 15 words.",
        },
      },
      required: ["suggestion"],
    },
  },
];

function getConversationContext(
  inputs: BuilderSuggestionInputType
): ModelConversationTypeMultiActions {
  const instructions = "instructions" in inputs ? inputs.instructions : "";

  const instructionsText = instructions
    ? "\nAgent instructions\n======\n" + JSON.stringify(instructions)
    : "";

  return {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: instructionsText }],
        name: "",
      },
    ],
  };
}

export async function getBuilderDescriptionSuggestions(
  auth: Authenticator,
  inputs: BuilderSuggestionInputType
): Promise<Result<SuggestionResults, Error>> {
  const res = await runMultiActionsAgent(
    auth,
    {
      functionCall: FUNCTION_NAME,
      modelId: GPT_3_5_TURBO_MODEL_ID,
      providerId: "openai",
      temperature: 0.5,
      useCache: false,
    },
    {
      conversation: getConversationContext(inputs),
      prompt:
        "The user is currently creating an agent based on a large language model. " +
        "The agent has been given instructions by the user. Based on the provided " +
        "instructions suggest a short description of the agent.",
      specifications,
      forceToolCall: FUNCTION_NAME,
    },
    {
      context: {
        operationType: "agent_builder_description_suggestion",
        userId: auth.user()?.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  if (res.value.actions?.[0]?.arguments?.suggestion) {
    const { suggestion } = res.value.actions[0].arguments;

    return new Ok({
      status: "ok",
      suggestions: typeof suggestion === "string" ? [suggestion] : null,
    });
  }

  return new Err(new Error("No suggestions found"));
}
