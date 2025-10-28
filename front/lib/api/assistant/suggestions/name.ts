import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { SuggestionResults } from "@app/lib/api/assistant/suggestions/types";
import { getLLM } from "@app/lib/api/llm";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import type {
  BuilderSuggestionInputType,
  ModelConversationTypeMultiActions,
  Result,
  UserMessageTypeModel,
} from "@app/types";
import { Err, isStringArray, Ok, safeParseJSON } from "@app/types";

const FUNCTION_NAME = "send_suggestions";

const specifications: AgentActionSpecification[] = [
  {
    name: FUNCTION_NAME,
    description: "Send suggestions of names for the agent",
    inputSchema: {
      type: "object",
      properties: {
        suggestions: {
          type: "array",
          items: {
            type: "string",
            description: "A suggestion of name for the agent.",
          },
          description: "Suggest one to three names for the agent",
        },
      },
      required: ["suggestions"],
    },
  },
];

function getConversationContext(inputs: BuilderSuggestionInputType): {
  messages: Array<UserMessageTypeModel>;
} {
  const instructions = "instructions" in inputs ? inputs.instructions : "";
  const description = "description" in inputs ? inputs.description : "";

  const instructionsText = instructions
    ? "\nAgent instructions\n======\n" + JSON.stringify(instructions)
    : "";
  const descriptionText = description
    ? "Agent description\n======\n" + JSON.stringify(description)
    : "";
  const initialPrompt =
    "Please suggest one to three good names for an AI agent" +
    (instructions || description ? " based on the following data:" : ".");

  return {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text_content",
            value: initialPrompt + descriptionText + instructionsText,
          },
        ],
        name: "",
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
  const prompt =
    "The user is currently creating an agent based on a large language model." +
    "The agent has instructions and a description. You are provided with a single " +
    "message, consisting of this information if it is available. Your role is to " +
    "suggest good names for the agent. Names can not include whitespaces.";
  const conversation: ModelConversationTypeMultiActions =
    getConversationContext(inputs);
  const llm = await getLLM(auth, {
    modelId: "mistral-small-latest",
    options: { bypassFeatureFlag: true },
  });

  if (llm === null) {
    return new Err(new Error("Model not found"));
  }

  const events = await llm.stream({
    conversation,
    prompt,
    specifications,
  });

  for await (const event of events) {
    if (event.type === "tool_call") {
      const parsedArguments = safeParseJSON(event.content.arguments);
      if (parsedArguments.isErr()) {
        return new Err(
          new Error(
            `Error parsing suggestions from LLM: ${parsedArguments.error.message}`
          )
        );
      }
      if (
        !parsedArguments.value ||
        !("suggestions" in parsedArguments.value) ||
        !isStringArray(parsedArguments.value.suggestions)
      ) {
        return new Err(
          new Error(
            `Error retrieving suggestions from arguments: ${parsedArguments.value}`
          )
        );
      }

      const filteredSuggestions = await filterSuggestedNames(
        auth,
        parsedArguments.value.suggestions
      );

      return new Ok({
        status: "ok",
        suggestions: filteredSuggestions,
      });
    }
  }

  return new Err(new Error("No suggestions found"));
}
