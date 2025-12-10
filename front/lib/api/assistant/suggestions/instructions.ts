import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { SuggestionResults } from "@app/lib/api/assistant/suggestions/types";
import type { Authenticator } from "@app/lib/auth";
import type {
  BuilderSuggestionInputType,
  ModelConversationTypeMultiActions,
  ModelMessageTypeMultiActionsWithoutContentFragment,
  Result,
} from "@app/types";
import { Err, GPT_4_TURBO_MODEL_ID, isStringArray, Ok } from "@app/types";

const FUNCTION_NAME = "send_ranked_suggestions";

const specifications: AgentActionSpecification[] = [
  {
    name: FUNCTION_NAME,
    description:
      "Send ranked suggestions, ordered by relevance to make the user instructions better.",
    inputSchema: {
      type: "object",
      properties: {
        good_instructions: {
          type: "boolean",
          description:
            "true if the instructions typed by the user are good for a large language model and do not need any change; false otherwise",
        },
        new_suggestions: {
          type: "array",
          items: {
            type: "string",
            description:
              "A suggestion to improve the user's instructions to the assistant, phrased nicely, as a short question. It should not be more than thirty words.",
          },
          description:
            "Array of two new suggestions that would improve the instructions.",
        },
        former_suggestions: {
          type: "array",
          items: {
            type: "string",
            description:
              "A suggestion to improve the user's instructions to the assistant.",
          },
          description:
            "Array of already existing, user provided suggestions that would improve the instructions",
        },
        ranked_suggestions: {
          type: "array",
          items: {
            type: "string",
            description:
              "A suggestion to improve the user's instructions to the assistant.",
          },
          description:
            "Array of the suggestions taken from new_suggestions and former_suggestions, ranked by most important first. That is, the suggestion that will improve the instructions for the LLM best should come first.",
        },
      },
      required: [
        "good_instructions",
        "new_suggestions",
        "former_suggestions",
        "ranked_suggestions",
      ],
    },
  },
];

function getConversationContext(
  inputs: BuilderSuggestionInputType
): ModelConversationTypeMultiActions {
  const currentInstructions =
    "current_instructions" in inputs ? inputs.current_instructions : "";
  const formerSuggestions =
    "former_suggestions" in inputs ? inputs.former_suggestions : [];

  const currentInstructionsText = currentInstructions
    ? "Instructions I wrote for my assistant:\n" + currentInstructions
    : "";

  const messages: ModelMessageTypeMultiActionsWithoutContentFragment[] = [
    {
      role: "user",
      content: [{ type: "text", text: currentInstructionsText }],
      name: "",
    },
  ];

  if (formerSuggestions.length > 0) {
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text:
            "Former suggestions, that were already made regarding a former version of those instructions (you should make new suggestions that are different from those ones):\n" +
            JSON.stringify(formerSuggestions),
        },
      ],
      name: "",
    });
  }

  return { messages };
}

export async function getBuilderInstructionsSuggestions(
  auth: Authenticator,
  inputs: BuilderSuggestionInputType
): Promise<Result<SuggestionResults, Error>> {
  const res = await runMultiActionsAgent(
    auth,
    {
      functionCall: FUNCTION_NAME,
      modelId: GPT_4_TURBO_MODEL_ID,
      providerId: "openai",
      temperature: 0.7,
      useCache: false,
    },
    {
      conversation: getConversationContext(inputs),
      prompt:
        'A user is working on a Saas product called Dust, a tool for creating custom assistants based on large language models, to help employees to be more productive. \n\nContext\n---\nA few elements to bear in mind:\n- On Dust, users can give assistants access to company data (on slack, notion, google drive, github, intercom, confluence). Assistants that are configured to use company data can do semantic searches before answering the user, and use the retrieved data to reply;\n- some companies have created "Dust apps" and for some advanced use cases assistants can execute those dust apps before answering;\n- advanced use cases also include allowing assistants to query structured data from Notion Databases or Google Spreadsheets, that is, treating those documents as SQL databases and running sql queries on them;\n- however, in the majority of cases, custom assistants are either asked to reply only (i.e. without searching data, acting or querying structured data), or to perform retrieval-augmented-generation, that is to do semantic search on data and add the result to the LLM\'s context before generating the reply.\n\nThe user is currently writing instructions for the large language model prompt that will be the basis of a custom assistant they are creating for a specific purpose.\n\nYour task\n---\nBased on the instructions the user has written, propose two new suggestions to improve them, different from the already-existing former suggestions the user provided. Indicate if the instructions are already very good as they are. Rank all suggestions (former and new) by most important first.\nYou MUST answer by calling ' +
        FUNCTION_NAME,
      specifications,
      forceToolCall: FUNCTION_NAME,
    },
    {
      context: {
        operationType: "agent_builder_instruction_suggestion",
        userId: auth.user()?.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  const args = res.value.actions?.[0]?.arguments;
  if (
    args?.good_instructions !== undefined &&
    isStringArray(args.ranked_suggestions)
  ) {
    return new Ok({
      status: "ok",
      suggestions:
        args.good_instructions === true ? [] : args.ranked_suggestions,
    });
  }

  return new Err(new Error("No suggestions found"));
}
