import { AnthropicClaudeSonnetFourDotSix } from "@app/lib/api/models/clients/anthropic/models/anthropic-claude-sonnet-4-6";
import { OpenAiGptFiveDotTwo } from "@app/lib/api/models/clients/openai-responses/models/openai-gpt-5-2";
import { OpenAiGptFiveDotFour } from "@app/lib/api/models/clients/openai-responses/models/openai-gpt-5-4";
import type { LargeLanguageModel } from "@app/lib/api/models/large-language-model";
import type { Credentials } from "@app/lib/api/models/types/credentials";
import type {
  LargeLanguageModelId,
  Model,
} from "@app/lib/api/models/types/providers";
import { getIdFromModel } from "@app/lib/api/models/utils/getIdFromModel";

export { LargeLanguageModel } from "@app/lib/api/models/large-language-model";

type ModelClassConstructor = {
  new (credentials: Credentials): LargeLanguageModel;
};

export const MODEL_REGISTRY = {
  "anthropic/claude-sonnet-4-6": AnthropicClaudeSonnetFourDotSix,
  "openai/gpt-5.2": OpenAiGptFiveDotTwo,
  "openai/gpt-5.4": OpenAiGptFiveDotFour,
} as const satisfies Record<LargeLanguageModelId, ModelClassConstructor>;

export function getModel(
  credentials: Credentials,
  model: Model
): LargeLanguageModel {
  const ModelClass = MODEL_REGISTRY[getIdFromModel(model)];

  return new ModelClass(credentials);
}
