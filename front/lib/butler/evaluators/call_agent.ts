import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type {
  ButlerEvaluator,
  EvaluatorContext,
  EvaluatorResult,
} from "@app/lib/butler/evaluators/types";
import { z } from "zod";

const FUNCTION_NAME = "evaluate_agent";
const CONFIDENCE_THRESHOLD = 70;
const MAX_AGENTS_IN_PROMPT = 50;

const AgentResult = z.object({
  agent_confidence: z.number(),
  agent_name: z.string(),
  agent_prompt: z.string(),
});

export const callAgentEvaluator: ButlerEvaluator = {
  type: "call_agent",

  shouldRun(context: EvaluatorContext): boolean {
    return context.availableAgents.length > 0;
  },

  getPromptAndSpec(context: EvaluatorContext): {
    prompt: string;
    specification: AgentActionSpecification;
  } {
    const agents = context.availableAgents.slice(0, MAX_AGENTS_IN_PROMPT);

    let prompt =
      "You are a conversation analyst. Your job is to determine if one of the available agents could help the user.\n\n";

    prompt +=
      "Agent suggestion guidelines:\n" +
      "- Review the list of available agents below and determine if one could help with the user's current question or task.\n" +
      "- Set agent_confidence HIGH (>75) only when an agent clearly matches the user's need " +
      "and hasn't already been involved in the conversation.\n" +
      "- Set agent_confidence LOW (<30) when the user's need is already being addressed " +
      "or no agent is a strong match.\n" +
      "- The agent_name MUST exactly match one of the names from the list below.\n" +
      "- The agent_prompt should be a natural message the user would send to that agent.\n\n" +
      "Available agents:\n";

    for (const agent of agents) {
      const description = agent.description ? `: ${agent.description}` : "";
      prompt += `- ${agent.name}${description}\n`;
    }
    prompt += "\n";

    const agentHistory = context.suggestionHistory.filter(
      (s) => s.suggestionType === "call_agent"
    );
    if (agentHistory.length > 0) {
      prompt += "Previous agent suggestion history (most recent first):\n";
      for (const suggestion of agentHistory) {
        const outcome =
          suggestion.status === "accepted" ? "ACCEPTED" : "DISMISSED";
        const { agentName } = suggestion.metadata;
        prompt += `- [${outcome}] Agent suggestion: ${agentName}\n`;
      }
      prompt += "\n";
    }

    prompt += "You MUST call the tool. Always call it.";

    const specification: AgentActionSpecification = {
      name: FUNCTION_NAME,
      description:
        "Evaluate whether one of the available agents could help the user.",
      inputSchema: {
        type: "object",
        properties: {
          agent_confidence: {
            type: "number",
            description:
              "Confidence from 0 to 100 that one of the listed agents would help the user. " +
              "Use 0 if the conversation doesn't need agent help or no agents are relevant.",
          },
          agent_name: {
            type: "string",
            description:
              "The exact name of the recommended agent from the provided list, or empty string if none.",
          },
          agent_prompt: {
            type: "string",
            description:
              "A suggested message to send to the recommended agent, or empty string if none.",
          },
        },
        required: ["agent_confidence", "agent_name", "agent_prompt"],
      },
    };

    return { prompt, specification };
  },

  parseResult(
    toolArguments: Record<string, unknown>,
    context: EvaluatorContext
  ): EvaluatorResult | null {
    const parsed = AgentResult.safeParse(toolArguments);
    if (!parsed.success) {
      return null;
    }

    const { agent_confidence, agent_name, agent_prompt } = parsed.data;

    if (
      agent_confidence < CONFIDENCE_THRESHOLD ||
      !agent_name ||
      !agent_prompt
    ) {
      return null;
    }

    // Validate that the agent name matches an available agent (case-insensitive).
    const matchedAgent = context.availableAgents.find(
      (a) => a.name.toLowerCase() === agent_name.toLowerCase()
    );

    if (!matchedAgent) {
      return null;
    }

    return {
      suggestionType: "call_agent",
      metadata: {
        agentSId: matchedAgent.sId,
        agentName: matchedAgent.name,
        prompt: agent_prompt,
      },
    };
  },
};
