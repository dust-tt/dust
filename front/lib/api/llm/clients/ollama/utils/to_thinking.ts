import {
  OLLAMA_MODEL_CONFIGS,
  type OllamaWhitelistedModelId,
} from "@app/lib/api/llm/clients/ollama/types";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { ChatRequest } from "ollama";

export function toThinkingConfig({
  modelId,
  reasoningEffort,
  useNativeLightReasoning,
}: {
  modelId: OllamaWhitelistedModelId;
  reasoningEffort: ReasoningEffort | null;
  useNativeLightReasoning?: boolean;
}): ChatRequest["think"] {
  const thinkingConfig = OLLAMA_MODEL_CONFIGS[modelId].thinkingConfig;

  if (reasoningEffort === "light" && !useNativeLightReasoning) {
    return thinkingConfig.none;
  }

  switch (reasoningEffort) {
    case null:
      return undefined;
    case "none":
    case "light":
    case "medium":
    case "high":
      return thinkingConfig[reasoningEffort];
    default:
      assertNever(reasoningEffort);
  }
}
