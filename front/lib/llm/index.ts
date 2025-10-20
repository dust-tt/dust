import type { LLM } from "@app/lib/llm/llm";
import { MistralLLM } from "@app/lib/llm/providers/mistral";
import type { LLMOptions } from "@app/lib/llm/types/options";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";

export function getLLM({
  model,
  options: _options,
}: {
  model: ModelConfigurationType;
  options?: LLMOptions;
}): LLM | null {
  switch (model.providerId) {
    case "mistral": {
      return new MistralLLM({
        model,
      });
    }
    default:
      return null;
  }
}
