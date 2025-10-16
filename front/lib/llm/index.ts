import type { LLM } from "@app/lib/llm/llm";
import { AnthropicLLM } from "@app/lib/llm/providers/anthropic";
import { MistralLLM } from "@app/lib/llm/providers/mistral";
import { getProviderFromModelId } from "@app/types/assistant/models/models";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export function getLLM({
  modelId,
  temperature,
}: {
  modelId: string;
  temperature: number;
}): Result<LLM, Error> {
  const providerResult = getProviderFromModelId(modelId);
  if (providerResult.isErr()) {
    return providerResult;
  }

  const provider = providerResult.value;

  let model: LLM;

  switch (provider) {
    case "mistral":
      try {
        model = new MistralLLM({ modelId, temperature });
      } catch (error) {
        return new Err(new Error(`Failed to create MistralLLM: ${error}`));
      }
      break;
    case "anthropic":
      try {
        model = new AnthropicLLM({ modelId, temperature: 1 });
      } catch (error) {
        return new Err(new Error(`Failed to create AnthropicLLM: ${error}`));
      }
      break;
    default:
      return new Err(new Error(`Unsupported provider: ${provider}`));
  }

  return new Ok(model);
}
