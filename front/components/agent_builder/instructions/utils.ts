import type { ModelConfigurationType, ModelIdType } from "@app/types";
import {
  CLAUDE_3_5_SONNET_20241022_MODEL_ID,
  GPT_4O_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
} from "@app/types";
import {
  AGENT_CREATIVITY_LEVEL_TEMPERATURES,
  AGENT_CREATIVITY_LEVEL_DISPLAY_NAMES,
} from "@app/components/agent_builder/types";
import type { AgentCreativityLevel } from "@app/components/agent_builder/types";

export const BEST_PERFORMING_MODELS_ID: ModelIdType[] = [
  GPT_4O_MODEL_ID,
  CLAUDE_3_5_SONNET_20241022_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
] as const;

export const CREATIVITY_LEVELS = Object.entries(
  AGENT_CREATIVITY_LEVEL_TEMPERATURES
).map(([k, v]) => ({
  label: AGENT_CREATIVITY_LEVEL_DISPLAY_NAMES[k as AgentCreativityLevel],
  value: v,
}));

export function isBestPerformingModel(modelId: ModelIdType): boolean {
  return BEST_PERFORMING_MODELS_ID.includes(modelId);
}

export function categorizeModels(models: ModelConfigurationType[]): {
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
  return `${modelConfig.modelId}${modelConfig.reasoningEffort ? `-${modelConfig.reasoningEffort}` : ""}`;
}
