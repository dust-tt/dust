import {
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
} from "@app/types/assistant/models/anthropic";
import { GEMINI_3_1_PRO_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";
import { MISTRAL_MEDIUM_3_5_MODEL_ID } from "@app/types/assistant/models/mistral";
import { GPT_5_6_TERRA_MODEL_ID } from "@app/types/assistant/models/openai";
import { getModelMaker } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelIdType,
  ModelMakerIdType,
} from "@app/types/assistant/models/types";

const BEST_PERFORMING_MODELS_ID: ModelIdType[] = [
  GPT_5_6_TERRA_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  MISTRAL_MEDIUM_3_5_MODEL_ID,
  GEMINI_3_1_PRO_MODEL_ID,
] as const;

function isBestPerformingModel(modelId: ModelIdType): boolean {
  return BEST_PERFORMING_MODELS_ID.includes(modelId);
}

function categorizeModels<T extends ModelConfigurationType>(
  models: T[]
): {
  bestPerformingModelConfigs: T[];
  otherModelConfigs: T[];
} {
  const bestPerformingModelConfigs: T[] = [];
  const otherModelConfigs: T[] = [];

  for (const modelConfig of models) {
    if (isBestPerformingModel(modelConfig.modelId)) {
      bestPerformingModelConfigs.push(modelConfig);
    } else {
      otherModelConfigs.push(modelConfig);
    }
  }

  return { bestPerformingModelConfigs, otherModelConfigs };
}

export function getModelKey(
  modelConfig: Pick<ModelConfigurationType, "modelId">
): ModelIdType {
  return modelConfig.modelId;
}

// Enhanced categorization for new UI structure
interface ModelCategories<
  T extends ModelConfigurationType = ModelConfigurationType,
> {
  bestGeneralModels: T[];
  makerGroups: Map<
    ModelMakerIdType,
    {
      recent: T[];
      older: T[];
    }
  >;
}

export function getModelsCategorization<T extends ModelConfigurationType>(
  models: T[]
): ModelCategories<T> {
  // Use existing categorization to separate best performing models
  const { bestPerformingModelConfigs, otherModelConfigs } =
    categorizeModels(models);

  // Group remaining models by maker (lab) and separate recent vs older
  const makerGroups = new Map<
    ModelMakerIdType,
    {
      recent: T[];
      older: T[];
    }
  >();

  for (const model of otherModelConfigs) {
    const makerId = getModelMaker(model);
    if (!makerGroups.has(makerId)) {
      makerGroups.set(makerId, { recent: [], older: [] });
    }

    const group = makerGroups.get(makerId)!;
    if (model.isLatest) {
      group.recent.push(model);
    } else {
      group.older.push(model);
    }
  }

  return {
    bestGeneralModels: bestPerformingModelConfigs,
    makerGroups,
  };
}
