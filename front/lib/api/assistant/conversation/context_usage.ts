import type { SupportedModel } from "@app/types/assistant/models/types";

export type GetConversationContextUsageResponse = {
  model: SupportedModel | null;
  contextUsage: number | null;
  contextSize: number | null;
};
