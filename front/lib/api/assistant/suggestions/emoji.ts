import { isLeft } from "fp-ts/lib/Either";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { SuggestionResults } from "@app/lib/api/assistant/suggestions/types";
import type { Authenticator } from "@app/lib/auth";
import type {
  BuilderSuggestionInputType,
  ModelConversationTypeMultiActions,
  Result,
} from "@app/types";
import {
  BuilderEmojiSuggestionsResponseBodySchema,
  Err,
  GPT_3_5_TURBO_MODEL_ID,
  Ok,
} from "@app/types";

const FUNCTION_NAME = "send_suggestions";

const specifications: AgentActionSpecification[] = [
  {
    name: FUNCTION_NAME,
    description: "Send suggestions of names for the assistants",
    inputSchema: {
      type: "object",
      properties: {
        suggestions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              emoji: {
                type: "string",
                description: "The emoji. Use only standard emojis.",
              },
              backgroundColor: {
                type: "string",
                description: "Tailwind CSS class for the background color",
                enum: [
                  "bg-green-200",
                  "bg-green-300",
                  "bg-yellow-200",
                  "bg-yellow-300",
                  "bg-blue-200",
                  "bg-blue-300",
                  "bg-red-200",
                  "bg-red-300",
                  "bg-purple-200",
                  "bg-purple-300",
                  "bg-orange-200",
                  "bg-orange-300",
                ],
              },
            },
            required: ["emoji", "backgroundColor"],
            additionalProperties: false,
          },
          description: "Suggest one to three emojis for the assistant",
        },
      },
      required: ["suggestions"],
    },
  },
];

function getConversationContext(
  inputs: BuilderSuggestionInputType
): ModelConversationTypeMultiActions {
  const instructions = "instructions" in inputs ? inputs.instructions : "";

  const instructionsText = instructions
    ? "\nAssistant instructions\n======\n" + JSON.stringify(instructions)
    : "";

  const initialPrompt =
    "Please suggest one to three good emojis for an AI agent" +
    (instructions ? " based on the following data:" : ".");

  return {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: initialPrompt + instructionsText }],
        name: "",
      },
    ],
  };
}

export async function getBuilderEmojiSuggestions(
  auth: Authenticator,
  inputs: BuilderSuggestionInputType
): Promise<Result<SuggestionResults, Error>> {
  const res = await runMultiActionsAgent(
    auth,
    {
      functionCall: FUNCTION_NAME,
      modelId: GPT_3_5_TURBO_MODEL_ID,
      providerId: "openai",
      temperature: 0.7,
      useCache: false,
    },
    {
      conversation: getConversationContext(inputs),
      prompt:
        "Task Overview: Assist in the customization of a virtual assistant’s visual identity by selecting an emoji for its avatar. The assistant's design and purpose will be described in each message you receive.\n\nObjective: Your main responsibility is to choose an emoji that captures the essence of the assistant, reflecting its unique functions, personality, or the context in which it will be used.\n\nGuidelines:\n- Broaden Your Choices: Consider a wide range of emojis to find one that uniquely represents the assistant's qualities or use case. Avoid defaulting to common choices unless they are the best fit. Try to avoid the generic 🤖 that could work for all assistants, unless the topic is truly about robots.\n- Relevance is Key: Select emojis that directly relate to the assistant’s described characteristics or intended environment. For instance, a 🎨 might suit a creative design tool, while a 📚 could represent a learning aid.\n- Compatibility Consideration: Ensure that your choices adhere to the Unicode standard to guarantee that the emoji displays correctly across all platforms.",
      specifications,
      forceToolCall: FUNCTION_NAME,
    },
    {
      context: {
        operationType: "agent_builder_emoji_suggestion",
        userId: auth.user()?.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  if (res.value.actions?.[0]?.arguments?.suggestions) {
    const suggestionsResult = BuilderEmojiSuggestionsResponseBodySchema.decode(
      res.value.actions[0].arguments
    );

    if (isLeft(suggestionsResult)) {
      return new Err(
        new Error(
          `Error retrieving suggestions from arguments: ${res.value.actions[0].arguments}`
        )
      );
    }

    return new Ok({
      status: "ok",
      ...suggestionsResult.right,
    });
  }

  return new Err(new Error("No suggestions found"));
}
