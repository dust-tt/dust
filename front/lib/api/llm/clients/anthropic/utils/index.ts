import type { ModelConfigurationType } from "@app/types";

export const CLAUDE_4_THINKING_BUDGET_TOKENS = {
  none: 0,
  light: 0,
  medium: 1024,
  high: 4096,
};

export const isClaude4 = (model: ModelConfigurationType) =>
  model.modelId.startsWith("claude-4") ||
  model.modelId.startsWith("claude-sonnet-4");
