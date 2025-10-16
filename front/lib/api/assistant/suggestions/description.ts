import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { SuggestionResults } from "@app/lib/api/assistant/suggestions/types";
import type { Authenticator } from "@app/lib/auth";
import type { BuilderSuggestionInputType, Result } from "@app/types";
import { Err, GPT_3_5_TURBO_MODEL_ID, Ok } from "@app/types";

const FUNCTION_NAME = "send_suggestion";

const specifications = [
  {
    name: FUNCTION_NAME,
    description: "Send a suggestion of description for the assistant",
    inputSchema: {
      type: "object",
      properties: {
        suggestion: {
          type: "string",
          description:
            "A description of the assistant using 1 short sentence. Be factual, clear and concise. " +
            "Do not use more than 15 words.",
        },
      },
      required: ["suggestion"],
    },
  },
];

function getConversationContext(inputs: BuilderSuggestionInputType) {
  const instructions = "instructions" in inputs ? inputs.instructions : "";

  const instructionsText = instructions
    ? "\nAssistant instructions\n======\n" + JSON.stringify(instructions)
    : "";

  return {
    messages: [
      {
        role: "user",
        content: instructionsText,
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
        "The user is currently creating an assistant based on a large language model. " +
        "The assistant has been given instructions by the user. Based on the provided " +
        "instructions suggest a short description of the assistant.",
      specifications,
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
