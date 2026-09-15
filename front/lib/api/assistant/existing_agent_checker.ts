import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getSmallWhitelistedModel } from "@app/lib/api/assistant/models";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import chunk from "lodash/chunk";
import uniq from "lodash/uniq";

// Safeguards to avoid sending a huge number of agents to a single LLM call:
// agents are checked in batches of this size, one LLM call per batch.
export const AGENTS_PER_LLM_CALL = 100;
const MAX_CONCURRENT_LLM_CALLS = 4;
const MAX_INSTRUCTIONS_LENGTH_CHARS = 5000;

const SET_SIMILAR_AGENTS_FUNCTION_NAME = "set_similar_agents";

const specifications: AgentActionSpecification[] = [
  {
    name: SET_SIMILAR_AGENTS_FUNCTION_NAME,
    description: "Set the similar agent ids",
    inputSchema: {
      type: "object",
      properties: {
        similar_agents_array: {
          type: "array",
          description: "An array of similar agent ids.",
          items: {
            type: "string",
          },
        },
      },
      required: ["similar_agents_array"],
    },
  },
];

const PROMPT = `# Role
You identify existing agents in a workspace that duplicate or overlap with a new agent being created.

# Input
You receive the instructions (system prompt) of the new agent, followed by the instructions of each existing agent, identified by its agent ID.
Instructions describe how an agent should behave and what it should do. Compare what the agents are for, not how their instructions are phrased.
Instructions may be long or truncated; focus on the core purpose they express.

# Similarity Criteria
Agents are similar when they serve the same user need or solve the same problem.
Ask yourself: "Would you be confused about which agent to use?"

Examples of similar agents:
- "You answer employee questions about our HR policies" and "You are an HR policy assistant. Help employees find answers in the HR handbook." (same purpose)
- "Summarize customer support tickets" and "Summarize Zendesk tickets" (same outcome)

Examples of agents that are NOT similar:
- "Answer HR policy questions" and "Draft HR policy documents" (different actions, same domain)
- "Summarize Zendesk tickets" and "Summarize Jira tickets" (different tools, similar action)

# Instructions
Return agent IDs that would cause confusion about which agent to use.
Prefer precision over recall; only return truly overlapping agents.

IMPORTANT: Returning an empty array is the expected outcome in most cases.
Only return agent IDs when you are confident there is a genuine duplicate. When in doubt, return an empty array.

# Examples
## Example 1 - Clear duplicates
Input: "You are an assistant that answers employee questions about our HR policies. Use the HR handbook to ground your answers and cite the relevant section."
Existing agents:
---
Agent ID abc12: "You are the HR policy assistant. Answer employee questions about HR policies using the company handbook. Be concise and link to the source."
---
Agent ID xxx15: "You help the People team draft new HR policy documents. Follow the company template and use formal language."
---
Agent ID 20aaa: "Help employees understand company HR policies. When asked, explain the policy in plain language and point to the official document."
---
Agent ID 25iju: "You manage incoming customer support emails: triage them, suggest a reply, and flag urgent ones."

Output: set_similar_agents({ "similar_agents_array": ["abc12", "20aaa"] })
Reasoning: abc12 and 20aaa both answer employee questions about HR policies.

## Example 2 - No duplicates
Input: "You generate PowerPoint-like presentations from a short brief. Propose a slide outline first, then write the content of each slide."
Existing agents:
---
Agent ID abc12: "You are the HR policy assistant. Answer employee questions about HR policies using the company handbook."
---
Agent ID xxx15: "Summarize Zendesk tickets. For each ticket, output the customer issue, the current status and the next action."

Output: set_similar_agents({ "similar_agents_array": [] })
Reasoning: None of the existing agents handle presentations.

## Example 3 - Same domain, different action
Input: "You help the People team draft HR policy documents. Follow the company template and use formal language."
Existing agents:
---
Agent ID aaa01: "Answer employee questions about HR policies using the company handbook."

Output: set_similar_agents({ "similar_agents_array": [] })
Reasoning: Both concern HR policies but actions don't overlap.
`;

function truncateInstructions(instructions: string): string {
  if (instructions.length > MAX_INSTRUCTIONS_LENGTH_CHARS) {
    return instructions.slice(0, MAX_INSTRUCTIONS_LENGTH_CHARS);
  }
  return instructions;
}

async function findSimilarAgentsInBatch(
  auth: Authenticator,
  {
    model,
    naturalDescription,
    agents,
  }: {
    model: ModelConfigurationType;
    naturalDescription: string;
    agents: LightAgentConfigurationType[];
  }
): Promise<Result<string[], Error>> {
  const owner = auth.getNonNullableWorkspace();

  const existingAgents = agents
    .map(
      (a) => `Agent ID ${a.sId}:
"${truncateInstructions(a.instructions ?? "")}"`
    )
    .join("\n---\n");
  const inputText = `Input: "${naturalDescription}"
Existing agents:
${existingAgents}
`;

  const res = await runMultiActionsAgent(
    auth,
    {
      modelId: model.modelId,
      providerId: model.providerId,
      temperature: 0.2,
      useCache: false,
    },
    {
      conversation: {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: inputText }],
            name: "",
          },
        ],
      },
      prompt: PROMPT,
      specifications,
      forceToolCall: SET_SIMILAR_AGENTS_FUNCTION_NAME,
    },
    {
      context: {
        operationType: "agent_builder_similar_agents_checker",
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  let similar_agents: string[] | null = null;

  if (res.value.actions) {
    for (const action of res.value.actions) {
      if (action.name === SET_SIMILAR_AGENTS_FUNCTION_NAME) {
        similar_agents = action.arguments.similar_agents_array;
      }
    }
  }

  if (!similar_agents) {
    return new Err(new Error("No similar agents generated"));
  }

  return new Ok(similar_agents);
}

export async function getSimilarAgents(
  auth: Authenticator,
  inputs: {
    naturalDescription: string;
  }
): Promise<Result<{ similar_agents: string[] }, Error>> {
  if (!(await hasFeatureFlag(auth, "similar_agents_check"))) {
    return new Ok({ similar_agents: [] });
  }

  const model = await getSmallWhitelistedModel(auth);
  if (!model) {
    return new Err(
      new Error("Failed to find a whitelisted model to check similar agents")
    );
  }

  // Retrieve agents visible to the user in the workspace (same set as the
  // "manage agents" list). Only agents with a description filled in are
  // considered "documented" enough to be worth comparing against, even
  // though the instructions (not the description) are what gets compared.
  const allAgents = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "list",
    variant: "light",
  });
  const agents = allAgents.filter((a) => a.description.trim().length > 0);

  if (agents.length === 0) {
    return new Ok({ similar_agents: [] });
  }

  // Check agents in batches, one LLM call per batch, so all agents are
  // considered regardless of how many the workspace has.
  const batches = chunk(agents, AGENTS_PER_LLM_CALL);
  const results = await concurrentExecutor(
    batches,
    async (batch) =>
      findSimilarAgentsInBatch(auth, {
        model,
        naturalDescription: inputs.naturalDescription,
        agents: batch,
      }),
    { concurrency: MAX_CONCURRENT_LLM_CALLS }
  );

  const similarAgentIds: string[] = [];
  for (const res of results) {
    if (res.isErr()) {
      return new Err(res.error);
    }
    similarAgentIds.push(...res.value);
  }

  return new Ok({ similar_agents: uniq(similarAgentIds) });
}
