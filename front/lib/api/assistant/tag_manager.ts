import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { formatValidationErrors } from "io-ts-reporters";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types";
import { Err, getLargeWhitelistedModel, Ok } from "@app/types";

const SEND_TAGS_FUNCTION_NAME = "send_tags";

const WorkspaceTagSuggestionsResponseSchema = t.type({
  suggestions: t.union([
    t.array(
      t.type({
        name: t.string,
        agentIds: t.array(t.string),
      })
    ),
    t.null,
    t.undefined,
  ]),
});

const specifications: AgentActionSpecification[] = [
  {
    name: SEND_TAGS_FUNCTION_NAME,
    description: "Send tagging plan for the assistant",
    inputSchema: {
      type: "object",
      properties: {
        suggestions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "The tag name",
              },
              agentIds: {
                type: "array",
                description: "The ids of the agents that match this tag",
                items: {
                  type: "string",
                  description: "The agent id",
                },
              },
            },
            required: ["name", "agentIds"],
          },
        },
      },
      required: ["suggestions"],
    },
  },
];

const INSTRUCTIONS = `From the provided list of agents, extract about 15 tags and assign them to at least 20 agents. An agent can have multiple tags. You must associate all the agents from the "Agents list" to at least one tag.

Sends the tagging plan : A json list with the following format:

[
 {
   name: "Marketing",
   agentIds: ["8864464fad", "O91N1C6gMM"]
 },
 ...
]

With "name" the name of the tag, and "agentIds" the list of unique identifier of each agent that should have this tag. This list must contains valid identifier, matching a value in the "Identifier" line of the "Agents list", and must not contains duplicate.

- Keep tags short and descriptive.
- Avoid special characters, capitalize tag name
- Favor tags that are activity "Write, Code" or function related (Sales, Design, Product)
- Create tags for departments
- Do not use capabilities names as tags
- Identifies which team primarily uses the agent
- Function: describes the agent's main purpose

For example, this could be a list of valid tags:

Writing
Planning
Sales
Support
Marketing
Research
Analysis
Development
Finance
HR
Operations
Design
Strategy
Training
Compliance
Procurement
Security
Legal
Quality
Product

=================================
Agents list :
=================================
{{INPUT.agents}}`;

type WorkspaceTagSuggestion = {
  name: string;
  agentIds: string[];
};

export async function getWorkspaceTagSuggestions(
  auth: Authenticator,
  inputs: { formattedAgents: string }
): Promise<Result<{ suggestions?: WorkspaceTagSuggestion[] | null }, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const model = getLargeWhitelistedModel(owner);
  if (!model) {
    return new Err(
      new Error(
        "Failed to find a whitelisted model to generate tag suggestions"
      )
    );
  }

  const { formattedAgents } = inputs;

  const instructionsWithAgents = INSTRUCTIONS.replace(
    "{{INPUT.agents}}",
    formattedAgents
  );

  const res = await runMultiActionsAgent(
    auth,
    {
      functionCall: SEND_TAGS_FUNCTION_NAME,
      modelId: model.modelId,
      providerId: model.providerId,
      temperature: 0.7,
      useCache: false,
    },
    {
      conversation: {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Please suggest tags." }],
            name: "",
          },
        ],
      },
      prompt: instructionsWithAgents,
      specifications,
      forceToolCall: SEND_TAGS_FUNCTION_NAME,
    },
    {
      context: {
        operationType: "workspace_tags_suggestion",
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  const responseValidation = WorkspaceTagSuggestionsResponseSchema.decode(
    res.value.actions?.[0].arguments
  );

  if (isLeft(responseValidation)) {
    return new Err(
      new Error(
        `Error retrieving tag suggestions from arguments: ${formatValidationErrors(responseValidation.left)}`
      )
    );
  }

  return new Ok({
    suggestions: responseValidation.right.suggestions,
  });
}
