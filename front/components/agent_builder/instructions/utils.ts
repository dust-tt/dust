import type { AgentCreativityLevel } from "@app/components/agent_builder/types";
import {
  AGENT_CREATIVITY_LEVEL_DISPLAY_NAMES,
  AGENT_CREATIVITY_LEVEL_TEMPERATURES,
} from "@app/components/agent_builder/types";
import type {
  ModelConfigurationType,
  ModelIdType,
  ModelProviderIdType,
} from "@app/types";
import {
  CLAUDE_4_SONNET_20250514_MODEL_ID,
  GEMINI_2_5_PRO_MODEL_ID,
  GPT_4O_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
} from "@app/types";

const BEST_PERFORMING_MODELS_ID: ModelIdType[] = [
  GPT_4O_MODEL_ID,
  CLAUDE_4_SONNET_20250514_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
  GEMINI_2_5_PRO_MODEL_ID,
] as const;

const CREATIVITY_LEVELS = Object.entries(
  AGENT_CREATIVITY_LEVEL_TEMPERATURES
).map(([k, v]) => ({
  label: AGENT_CREATIVITY_LEVEL_DISPLAY_NAMES[k as AgentCreativityLevel],
  value: v,
}));

function isBestPerformingModel(modelId: ModelIdType): boolean {
  return BEST_PERFORMING_MODELS_ID.includes(modelId);
}

function categorizeModels(models: ModelConfigurationType[]): {
  bestPerformingModelConfigs: ModelConfigurationType[];
  otherModelConfigs: ModelConfigurationType[];
} {
  const bestPerformingModelConfigs: ModelConfigurationType[] = [];
  const otherModelConfigs: ModelConfigurationType[] = [];

  for (const modelConfig of models) {
    if (isBestPerformingModel(modelConfig.modelId)) {
      bestPerformingModelConfigs.push(modelConfig);
    } else {
      otherModelConfigs.push(modelConfig);
    }
  }

  return { bestPerformingModelConfigs, otherModelConfigs };
}

export function getModelKey(modelConfig: ModelConfigurationType): string {
  return modelConfig.modelId;
}

// Enhanced categorization for new UI structure
export interface ModelCategories {
  bestGeneralModels: ModelConfigurationType[];
  providerGroups: Map<
    ModelProviderIdType,
    {
      recent: ModelConfigurationType[];
      older: ModelConfigurationType[];
    }
  >;
}

export function getModelsCategorization(
  models: ModelConfigurationType[]
): ModelCategories {
  // Use existing categorization to separate best performing models
  const { bestPerformingModelConfigs, otherModelConfigs } =
    categorizeModels(models);

  // Group remaining models by provider and separate recent vs older
  const providerGroups = new Map<
    ModelProviderIdType,
    {
      recent: ModelConfigurationType[];
      older: ModelConfigurationType[];
    }
  >();

  for (const model of otherModelConfigs) {
    if (!providerGroups.has(model.providerId)) {
      providerGroups.set(model.providerId, { recent: [], older: [] });
    }

    const group = providerGroups.get(model.providerId)!;
    if (model.isLatest) {
      group.recent.push(model);
    } else {
      group.older.push(model);
    }
  }

  return {
    bestGeneralModels: bestPerformingModelConfigs,
    providerGroups,
  };
}
