import type { AgentModelConfigurationType } from "@app/types/assistant/agent";
import {
  CLAUDE_OPUS_4_6_LONG_CONTEXT_MODEL_ID,
  CLAUDE_OPUS_4_6_MODEL_ID,
  CLAUDE_SONNET_4_6_LONG_CONTEXT_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
} from "@app/types/assistant/models/anthropic";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import type {
  ModelConfigurationType,
  SupportedModel,
} from "@app/types/assistant/models/types";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

/**
 * Lazy-loaded cache for model configurations.
 * Currently wraps static arrays - Next PR will add GCS loading for custom models.
 */
let _modelConfigs: ModelConfigurationType[] | null = null;

/**
 * Initialize model configurations.
 * Called once at app startup (Next PR will make this load from GCS).
 */
export function initializeModelConfigs(): void {
  _modelConfigs = [...SUPPORTED_MODEL_CONFIGS];
}

/**
 * Get all supported model configurations.
 * Stays synchronous reads from cache with lazy initialization fallback.
 */
export function getSupportedModelConfigs(): readonly ModelConfigurationType[] {
  // Fallback to static if not initialized.
  _modelConfigs ??= [...SUPPORTED_MODEL_CONFIGS];
  return _modelConfigs;
}

/**
 * Get a specific supported model configuration by model/provider ID.
 * Returns null if the model configuration is not found.
 * Stays synchronous reads from cache.
 */
export function getSupportedModelConfig(
  supportedModel: SupportedModel | AgentModelConfigurationType
): ModelConfigurationType | null {
  const configs = getSupportedModelConfigs();
  const config = configs.find(
    (m) =>
      m.modelId === supportedModel.modelId &&
      m.providerId === supportedModel.providerId
  );

  return config ?? null;
}

/**
 * Get a specific model configuration by model ID only.
 * Stays synchronous reads from cache.
 */
export function getModelConfigByModelId(
  modelId: string
): ModelConfigurationType | undefined {
  const configs = getSupportedModelConfigs();
  return configs.find((m) => m.modelId === modelId);
}

const LONG_CONTEXT_MODEL_MAP: Record<string, string> = {
  [CLAUDE_SONNET_4_6_MODEL_ID]: CLAUDE_SONNET_4_6_LONG_CONTEXT_MODEL_ID,
  [CLAUDE_OPUS_4_6_MODEL_ID]: CLAUDE_OPUS_4_6_LONG_CONTEXT_MODEL_ID,
};

/**
 * Resolve a model to its long-context variant when the workspace has the
 * `long_context_claude_feature` flag enabled.
 */
export function resolveModelWithLongContext<
  T extends SupportedModel | AgentModelConfigurationType,
>(supportedModel: T, featureFlags: WhitelistableFeature[]): T {
  if (!featureFlags.includes("long_context_claude_feature")) {
    return supportedModel;
  }

  const longContextModelId = LONG_CONTEXT_MODEL_MAP[supportedModel.modelId];
  if (!longContextModelId) {
    return supportedModel;
  }

  return {
    ...supportedModel,
    modelId: longContextModelId,
  };
}
