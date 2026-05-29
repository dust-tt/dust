import type {
  LargeLanguageModelId,
  Model,
} from "@app/lib/model_constructors/types/providers";

export const getIdFromModel = (model: Model) => {
  return `${model.providerId}/${model.modelId}` as LargeLanguageModelId;
};
