import { ModelSelectionSchema } from "@app/types/assistant/models/types";

/**
 * Optional per-message model + reasoning-effort override for Dust MCP tools that
 * post a user message. Same shape as the public API `modelSelection` field.
 */
export const mcpModelSelectionInputSchema = ModelSelectionSchema.describe(
  "Optional per-message model and reasoning-effort override for the mentioned agent. " +
    "Provide providerId, modelId, and optionally reasoningEffort " +
    '(e.g. "none", "low", "medium", "high"). ' +
    "Omitted means the agent runs its configured model. " +
    "Only applied when a message is posted."
).optional();
