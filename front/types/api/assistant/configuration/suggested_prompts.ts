import { z } from "zod";

export const MAX_AGENT_SUGGESTED_PROMPTS = 4;
export const MAX_AGENT_SUGGESTED_PROMPT_LENGTH = 256;

export const PutAgentSuggestedPromptsRequestBodySchema = z.object({
  suggestedPrompts: z.array(
    z.string().trim().min(1).max(MAX_AGENT_SUGGESTED_PROMPT_LENGTH)
  ),
});
export type PutAgentSuggestedPromptsRequestBody = z.infer<
  typeof PutAgentSuggestedPromptsRequestBodySchema
>;

export type AgentSuggestedPromptsResponseBody = {
  suggestedPrompts: string[];
};
