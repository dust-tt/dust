import { OpenAIModel as OpenAIModelClass } from "@/providers/openai/model";
import {
  GPT_5_2_2025_12_11,
  GPT_5_2_2025_12_11_MODEL_ID,
} from "@/providers/openai/models/gpt-5.2-2025-12-11";
import type { OpenAIModelId } from "@/providers/openai/types";

type OpenAIModelConstructor = new () => OpenAIModelClass;

const MODEL_REGISTRY: Record<OpenAIModelId, OpenAIModelConstructor> = {
  [GPT_5_2_2025_12_11_MODEL_ID]: GPT_5_2_2025_12_11,
};

export class OpenAIModelRouter {
  static getModel(modelId: OpenAIModelId): OpenAIModelClass {
    const ModelClass = MODEL_REGISTRY[modelId];

    if (!ModelClass) {
      throw new Error(`Unsupported model id: ${modelId}`);
    }

    return new ModelClass();
  }

  static isSupported(modelId: string): modelId is OpenAIModelId {
    return modelId in MODEL_REGISTRY;
  }
}
