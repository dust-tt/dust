import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { SuggestionResults } from "@app/lib/api/assistant/suggestions/types";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import type { BuilderSuggestionInputType, Result } from "@app/types";
import { Err, GPT_3_5_TURBO_MODEL_ID, Ok } from "@app/types";

const FUNCTION_NAME = "send_suggestions";

const specifications = [
  {
    name: FUNCTION_NAME,
    description: "Send suggestions of names for the assistants",
    inputSchema: {
      type: "object",
      properties: {
        suggestions: {
          type: "array",
          items: {
            type: "string",
            description: "A suggestion of name for the assistant.",
          },
          description: "Suggest one to three names for the assistant",
        },
      },
      required: ["suggestions"],
    },
  },
];

function getConversationContext(inputs: BuilderSuggestionInputType) {
  const instructions = "instructions" in inputs ? inputs.instructions : "";
  const description = "description" in inputs ? inputs.description : "";

  const instructionsText = instructions
    ? "\nAssistant instructions\n======\n" + JSON.stringify(instructions)
    : "";
  const descriptionText = description
    ? "Assistant description\n======\n" + JSON.stringify(description)
    : "";
  const initialPrompt =
    "Please suggest one to three good names for an AI assistant" +
    (instructions || description ? " based on the following data:" : ".");

  return {
    messages: [
      {
        role: "user",
        content: initialPrompt + descriptionText + instructionsText,
      },
    ],
  };
}

async function filterSuggestedNames(
  auth: Authenticator,
  suggestions: string[] | undefined | null
) {
  if (!suggestions || suggestions.length === 0) {
    return [];
  }
  // Filter out suggested names that are already in use in the workspace.
  const existingNames = (
    await AgentConfiguration.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        status: "active",
      },
      attributes: ["name"],
    })
  ).map((ac) => ac.name.toLowerCase());

  return suggestions?.filter((s) => !existingNames.includes(s.toLowerCase()));
}

export async function getBuilderNameSuggestions(
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
        "The user is currently creating an assistant based on a large language model." +
        "The assistant has instructions and a description. You are provided with a single " +
        "message, consisting of those informations if they are available. Your role is to " +
        "suggest good names for the assistant.",
      specifications,
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  if (res.value.actions?.[0]?.arguments?.suggestions) {
    const { suggestions } = res.value.actions[0].arguments;

    const filteredSuggestions = await filterSuggestedNames(auth, suggestions);

    return new Ok({
      status: "ok",
      suggestions: Array.isArray(filteredSuggestions)
        ? filteredSuggestions
        : null,
    });
  }

  return new Err(new Error("No suggestions found"));
}
