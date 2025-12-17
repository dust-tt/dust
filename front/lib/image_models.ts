import type { WhitelistableFeature, WorkspaceType } from "@app/types";
import { MODEL_PROVIDER_IDS } from "@app/types";
import type {
  ImageModelConfigurationType,
  ImageModelProviderIdType,
} from "@app/types/assistant/models/image_models";
import {
  DEFAULT_IMAGE_MODEL_CONFIG,
  SUPPORTED_IMAGE_MODEL_CONFIGS,
} from "@app/types/assistant/models/image_models";

/**
 * Get the configuration for a supported image model by its ID.
 */
export function getSupportedImageModelConfig(
  modelId: string
): ImageModelConfigurationType | undefined {
  return SUPPORTED_IMAGE_MODEL_CONFIGS.find((m) => m.modelId === modelId);
}

/**
 * Get the default image model configuration.
 */
export function getDefaultImageModelConfig(): ImageModelConfigurationType {
  return DEFAULT_IMAGE_MODEL_CONFIG;
}

/**
 * Check if an image provider is whitelisted for a workspace.
 * Uses the same whitelisting mechanism as text models.
 */
export function isImageProviderWhitelisted(
  owner: WorkspaceType,
  providerId: ImageModelProviderIdType
): boolean {
  const whiteListedProviders = owner.whiteListedProviders ?? MODEL_PROVIDER_IDS;
  // Image providers are a subset of model providers, so we can check directly
  return whiteListedProviders.includes(providerId);
}

/**
 * Check if a user can use a specific image model.
 */
export function canUseImageModel(
  model: ImageModelConfigurationType,
  featureFlags: WhitelistableFeature[],
  owner: WorkspaceType
): boolean {
  // Check feature flag if required
  if (model.featureFlag && !featureFlags.includes(model.featureFlag)) {
    return false;
  }

  // Check provider whitelist
  return isImageProviderWhitelisted(owner, model.providerId);
}

/**
 * Get all available image models for a workspace.
 */
export function getAvailableImageModels(
  owner: WorkspaceType,
  featureFlags: WhitelistableFeature[]
): ImageModelConfigurationType[] {
  return SUPPORTED_IMAGE_MODEL_CONFIGS.filter((model) =>
    canUseImageModel(model, featureFlags, owner)
  );
}

/**
 * Build enum options for image model selection in tool schemas.
 */
export function buildImageModelEnumOptions(): Array<{
  value: string;
  label: string;
}> {
  return SUPPORTED_IMAGE_MODEL_CONFIGS.filter((m) => !m.isLegacy).map((m) => ({
    value: m.modelId,
    label: m.displayName,
  }));
}
