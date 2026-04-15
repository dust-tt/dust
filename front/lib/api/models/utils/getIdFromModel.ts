import type {
  LargeLanguageModelId,
  Model,
} from "@app/lib/api/models/types/providers";

export const getIdFromModel = (model: Model) => {
  return `${model.providerId}/${model.modelId}` as LargeLanguageModelId;
};
