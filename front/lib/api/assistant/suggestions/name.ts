import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { SuggestionResults } from "@app/lib/api/assistant/suggestions/types";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import type {
  BuilderSuggestionInputType,
  ModelConversationTypeMultiActions,
  Result,
  UserMessageTypeModel,
} from "@app/types";
import { Err, isStringArray, MISTRAL_SMALL_MODEL_ID, Ok } from "@app/types";

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
            type: "text",
            text: initialPrompt + descriptionText + instructionsText,
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
    await AgentConfigurationModel.findAll({
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
  const res = await runMultiActionsAgent(
    auth,
    {
      functionCall: FUNCTION_NAME,
      modelId: MISTRAL_SMALL_MODEL_ID,
      providerId: "mistral",
      temperature: 0.7,
      useCache: false,
    },
    {
      conversation,
      prompt,
      specifications,
    },
    {
      context: {
        operationType: "agent_builder_name_suggestion",
        userId: auth.user()?.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  const args = res.value.actions?.[0]?.arguments;
  if (!args || !("suggestions" in args) || !isStringArray(args.suggestions)) {
    return new Err(
      new Error(
        `Error retrieving suggestions from arguments: ${JSON.stringify(args)}`
      )
    );
  }

  const filteredSuggestions = await filterSuggestedNames(
    auth,
    args.suggestions
  );

  return new Ok({
    status: "ok",
    suggestions: filteredSuggestions,
  });
}
