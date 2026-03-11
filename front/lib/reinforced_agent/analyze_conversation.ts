import type { AgentConfigurationType } from "@app/types/assistant/agent";

export function buildAnalysisPrompt(
  agentConfig: AgentConfigurationType,
  conversationText: string
): { systemPrompt: string; userMessage: string } {
  const descriptionSection = agentConfig.description
    ? `Description: ${agentConfig.description}`
    : "";
  const instructionsSection = agentConfig.instructionsHtml
    ? `\n### Current instructions\n${agentConfig.instructionsHtml}`
    : "";

  const systemPrompt = `You are an AI agent improvement analyst. Your job is to analyze a conversation handled by an AI agent and suggest concrete improvements to the agent's configuration.

## Your task
Analyze the conversation and identify areas where the agent's instructions could be improved. Pay special attention to any user feedback (thumbs up/down and comments) as direct signals of satisfaction or dissatisfaction. Focus on:
- Cases where the agent misunderstood the user's intent
- Missing knowledge or capabilities the agent should have
- Tone or style improvements based on user reactions and feedback
- Specific instructions that could prevent repeated mistakes

Only suggest changes to the instructions (kind: 'instructions'). Use targetBlockId 'instructions-root' for top-level instruction changes,
and the actual block ID for nested instructions.

The content must contain exactly what should go in the instructions block, with no explanation about why it should be there (that belongs in the analysis).
It is in HTML format, so make sure to preserve any HTML tags from the original instructions.

You MUST call the tool. Always call it. If no improvements are needed, return an empty suggestions array.`;

  const userMessage = `## Agent being analyzed
Name: ${agentConfig.name}
${descriptionSection}
${instructionsSection}

## Conversation to analyze

<conversation>
${conversationText}
</conversation>`;

  return { systemPrompt, userMessage };
}
