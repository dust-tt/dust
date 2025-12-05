import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import type { LightAgentConfigurationType, Result } from "@app/types";
import { GEMINI_2_5_FLASH_MODEL_CONFIG } from "@app/types";
import {
  Err,
  getSmallWhitelistedModel,
  isProviderWhitelisted,
  removeNulls,
} from "@app/types";
import { Ok } from "@app/types";

const INSTRUCTIONS = `# Goal:
The user started a conversation and did not pick any agent. Find the most relevant agents ids based on:
- The user's request.
- Each agent's display name, description, and favorite status.

Return up to 5 most relevant agents, ordered by match confidence.

# Guidelines:
- If the user's question requires information that is likely private or internal to the company (and therefore unlikely to be found on the public internet or within the agent's own knowledge), the agents to suggest should likely be able to search in the company's internal data sources to answer the question.
- If the users's question requires information that is recent and likely to be found on the public internet, the agents to suggest should probably have access to websearch.
- The agents named according to a model such as @gpt4 or @claude3.5 are a direct access to the base model with no specific configuration.

# Rank results by:
- Semantic match with the user request.
- Favorite status.

# Example:

For the message "I want to write a query to get the list of active user from last Monday" and these agents:
[
    {"id": "V7Mp4tpuaM", "handle": "@sqlGoddess", "description": "An improved version of sqlGod that is always up-to-date and can actually run the query for you.", "userFavorite": false},
    {"id": "5c7af3fb9c", "handle": "@tldr", "description": "I am the best at drafting summary for you", "userFavorite": false},
    {"id": "gpt4", "handle": "@gpt4", "description": "OpenAI's GPT 4.1 model (1M context).", "userFavorite": false}
]
Expected response is: {"suggested_agents":[{"id":"V7Mp4tpuaM"}, {"id":"gpt4"}]}
You must always use the field from the "id" attribute of the agent.

Here is the list of available agents:
`;

const FUNCTION_NAME = "suggest_agents";

const SUGGEST_AGENTS_FUNCTION_SPECIFICATIONS: AgentActionSpecification[] = [
  {
    name: FUNCTION_NAME,
    description:
      "Get the most relevant agents' ids to answer the user message.",
    inputSchema: {
      type: "object",
      properties: {
        suggested_agents: {
          type: "array",
          description: "Array of agent ids.",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The unique id of the agent.",
              },
            },
            required: ["id"],
          },
        },
      },
      required: ["suggested_agents"],
    },
  },
];

export async function getSuggestedAgentsForContent(
  auth: Authenticator,
  {
    content,
    agents,
    conversationId,
  }: {
    content: string;
    agents: LightAgentConfigurationType[];
    conversationId?: string;
  }
): Promise<Result<LightAgentConfigurationType[], Error>> {
  const owner = auth.getNonNullableWorkspace();

  let model = getSmallWhitelistedModel(owner);
  if (!model) {
    return new Err(
      new Error("Error suggesting agents: failed to find a whitelisted model.")
    );
  }

  // TODO(daphne): See if we can put Flash 2 as the default model.
  if (isProviderWhitelisted(owner, "google_ai_studio")) {
    model = GEMINI_2_5_FLASH_MODEL_CONFIG;
  }

  const formattedAgents = JSON.stringify(
    agents.map((a) => ({
      id: a.sId,
      displayName: `@${a.name}`,
      description: a.description,
      userFavorite: a.userFavorite,
    }))
  );

  const tracingRecords: Record<string, string> = { workspaceId: owner.sId };
  if (conversationId) {
    tracingRecords.conversationId = conversationId;
  }

  // Call runMultiActionsAgent.
  const res = await runMultiActionsAgent(
    auth,
    {
      providerId: model.providerId,
      modelId: model.modelId,
      functionCall: FUNCTION_NAME,
      temperature: 0.7,
      useCache: true,
    },
    {
      conversation: {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: content.trim() }],
            name: "",
          },
        ],
      },
      prompt: `${INSTRUCTIONS}${formattedAgents}`,
      specifications: SUGGEST_AGENTS_FUNCTION_SPECIFICATIONS,
      forceToolCall: FUNCTION_NAME,
    },
    {
      tracingRecords,
      context: {
        operationType: "agent_suggestion",
        contextId: conversationId,
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(new Error(`Error suggesting agents: ${res.error.message}`));
  }

  // Extract the suggested agents from the function call.
  const suggestedAgents = res.value.actions?.[0]?.arguments?.suggested_agents;

  if (!suggestedAgents || !Array.isArray(suggestedAgents)) {
    return new Err(
      new Error("No suggested_agents found in LLM response or invalid format")
    );
  }

  const suggestions = removeNulls(
    suggestedAgents.map((a: { id: string }) =>
      agents.find((a2) => a2.sId === a.id)
    )
  );

  return new Ok(suggestions);
}
