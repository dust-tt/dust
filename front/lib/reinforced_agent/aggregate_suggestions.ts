import type { AgentInstructionsSuggestionType } from "@app/types/suggestions/agent_suggestion";

export function buildAggregationPrompt(
  agentName: string,
  suggestions: AgentInstructionsSuggestionType[]
): { systemPrompt: string; userMessage: string } {
  const suggestionsSection = suggestions
    .map(
      (s, i) => `### Suggestion ${i + 1}
kind: ${s.kind}
targetBlockId: ${s.suggestion.targetBlockId}
analysis: ${s.analysis ?? "N/A"}
content: ${s.suggestion.content}`
    )
    .join("\n\n");

  const systemPrompt = `You are an AI agent improvement analyst. You have been given multiple suggestions from individual conversation analyses for the same agent. Your job is to deduplicate, merge, and prioritize them into a concise set of high-quality, actionable suggestions.

## Your task
- Merge suggestions that address the same issue, or that target the same block
- Keep only the most impactful suggestions (max 5)
- In the analysis, mention how many conversations support each suggestion
- When calling the tool, make sure there is never more than one suggestion targeting the same block (including instructions-root)

You MUST call the tool. If no suggestions survive aggregation, return an empty suggestions array.`;

  const userMessage = `## Agent: ${agentName}

## Synthetic suggestions from conversation analyses

${suggestionsSection}`;

  return { systemPrompt, userMessage };
}
