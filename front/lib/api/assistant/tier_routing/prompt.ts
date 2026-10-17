import type { RoutableStreamId } from "@app/lib/api/assistant/tier_routing/decide_tier";
import { getRoutingCandidates } from "@app/lib/api/assistant/tier_routing/decide_tier";
import type {
  DecisionRequest,
  DecisionScoreQuestion,
} from "@app/lib/model_constructors/types/input/decisions";
import type { ModelStreamIdType } from "@app/types/assistant/models/auto";

export const TIER_QUESTION_NAME = "minimum_tier";

const MAX_TOOLS = 30;
const MAX_TOOL_DESCRIPTION_CHARS = 160;
const MAX_MESSAGE_CHARS = 4_000;

const TIER_LEVELS: Record<
  ModelStreamIdType,
  DecisionScoreQuestion["levels"][number]
> = {
  auto_fast: {
    label: "basic",
    description:
      "Fast, low-cost model. Enough for greetings, simple questions, short rewrites or " +
      "translations, and requests needing one or two straightforward tool calls.",
  },
  auto: {
    label: "standard",
    description:
      "Strong general model. Enough for most work: multi-step tool use, research across " +
      "sources, analysis and long-form writing.",
  },
  auto_complex: {
    label: "premium",
    description:
      "Most capable model. Needed for hard reasoning, complex code, intricate multi-step " +
      "tool workflows, or high-stakes analysis where mistakes are costly.",
  },
};

const INSTRUCTIONS =
  "You route a request sent to an AI agent in Dust, a workplace assistant platform, to the " +
  "cheapest model tier that will answer it well. Rate the minimum tier the agent needs to " +
  "answer the latest user message, given its capabilities. If the conversation shows earlier " +
  "answers fell short (the user corrects the agent, repeats themselves, or asks for more depth " +
  "or accuracy), rate higher.";

export type AgentToolSummary = {
  name: string;
  description: string | null;
};

export type TierRoutingPromptInput = {
  configured: RoutableStreamId;
  agentName: string;
  agentDescription: string;
  tools: AgentToolSummary[];
  // Rendered prior turns, null on the first message.
  history: string | null;
  message: string;
};

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

function renderTools(tools: AgentToolSummary[]): string {
  if (tools.length === 0) {
    return "None.";
  }

  return tools
    .slice(0, MAX_TOOLS)
    .map(({ name, description }) =>
      description
        ? `- ${name}: ${truncate(description, MAX_TOOL_DESCRIPTION_CHARS)}`
        : `- ${name}`
    )
    .join("\n");
}

export function buildTierRoutingRequest({
  configured,
  agentName,
  agentDescription,
  tools,
  history,
  message,
}: TierRoutingPromptInput): DecisionRequest {
  const sections = [
    `Agent: ${agentName}`,
    `Description: ${agentDescription || "None."}`,
    `Tools:\n${renderTools(tools)}`,
    ...(history ? [`Conversation so far:\n${history}`] : []),
    `Latest user message:\n${truncate(message, MAX_MESSAGE_CHARS)}`,
  ];

  return {
    input: sections.join("\n\n"),
    questions: [
      {
        type: "score",
        name: TIER_QUESTION_NAME,
        instructions: INSTRUCTIONS,
        levels: getRoutingCandidates(configured).map(
          (streamId) => TIER_LEVELS[streamId]
        ),
      },
    ],
  };
}
