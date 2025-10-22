import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { SuggestionResults } from "@app/lib/api/assistant/suggestions/types";
import type { Authenticator } from "@app/lib/auth";
import type { BuilderSuggestionInputType, Result } from "@app/types";
import { Err, GPT_4_1_MINI_MODEL_ID, Ok } from "@app/types";

const FUNCTION_NAME = "send_suggestions";

const specifications = [
  {
    name: FUNCTION_NAME,
    description: "Send suggestions of tags for the agent",
    inputSchema: {
      type: "object",
      properties: {
        suggestions: {
          type: "array",
          items: {
            type: "string",
            description: "A suggestion of tags for the agent.",
          },
          description: "Suggest 3-5 relevant tags for the agent",
        },
      },
      required: ["suggestions"],
    },
  },
];

function getConversationContext(inputs: BuilderSuggestionInputType) {
  const instructions = "instructions" in inputs ? inputs.instructions : "";
  const description = "description" in inputs ? inputs.description : "";
  const tags = "tags" in inputs ? inputs.tags : [];

  const instructionsText = instructions
    ? "\nAgent instructions\n======\n" + JSON.stringify(instructions)
    : "";
  const descriptionText = description
    ? "Agent description\n======\n" + JSON.stringify(description)
    : "";
  const tagsText =
    tags.length > 0
      ? "Existing tags\n======\n" + JSON.stringify(tags.join(", "))
      : "";
  const initialPrompt =
    "Please suggest 3-5 good tags for an AI agent" +
    (instructions || description ? " based on the following data:" : ".");

  return {
    messages: [
      {
        role: "user",
        content: initialPrompt + descriptionText + instructionsText + tagsText,
      },
    ],
  };
}

// Admins can create new tags, so we let them suggest new ones.
const ADMIN_PROMPT = `
Suggest 3-5 relevant tags for a new AI agent. Tags should capture the agent's
main purpose, domain, or functionality. Requirements: single lowercase words only
(no spaces, dashes, or special characters). If existing tags are relevant, include them.
Return an empty list if no suitable tags exist.

Example:
Input:
Instructions: Helps users schedule meetings.
Description: Agent for calendar management and meeting coordination.
Existing tags: calendar, email, chatbot
Output:
calendar, meetings, scheduling
`;

// Regular users can only select from existing tags.
const USER_PROMPT = `
Suggest up to 5 tags for a new AI agent from the existing tags provided.
Select tags that best capture the agent's main purpose, domain, or functionality.
You must only use existing tags. Do not create new ones.
Return an empty list if none of the existing tags are relevant.

Example:
Input:
Instructions: Helps users schedule meetings.
Description: Agent for calendar management and meeting coordination.
Existing tags: calendar, email, chatbot
Output:
calendar
`;

export async function getBuilderTagSuggestions(
  auth: Authenticator,
  inputs: BuilderSuggestionInputType
): Promise<Result<SuggestionResults, Error>> {
  // TODO: UI incorrectly sends `isAdmin: false` even for admin users. As workaround,
  // check both client input AND server auth until frontend bug is fixed.
  const isAdminInput = "isAdmin" in inputs ? inputs.isAdmin : false;

  const res = await runMultiActionsAgent(
    auth,
    {
      functionCall: FUNCTION_NAME,
      modelId: GPT_4_1_MINI_MODEL_ID,
      providerId: "openai",
      temperature: 0.7,
      useCache: false,
    },
    {
      conversation: getConversationContext(inputs),
      prompt: auth.isAdmin() && isAdminInput ? ADMIN_PROMPT : USER_PROMPT,
      specifications,
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  if (res.value.actions?.[0]?.arguments?.suggestions) {
    const { suggestions } = res.value.actions[0].arguments;

    return new Ok({
      status: "ok",
      suggestions: Array.isArray(suggestions) ? suggestions : null,
    });
  }

  return new Err(new Error("No suggestions found"));
}
