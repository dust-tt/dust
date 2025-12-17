import type { WhitelistableFeature } from "@app/types";

// Image model provider IDs - subset of providers that support image generation
export const IMAGE_MODEL_PROVIDER_IDS = [
  "google_ai_studio",
  // "openai", // Future: DALL-E, GPT-Image
] as const;

export type ImageModelProviderIdType = (typeof IMAGE_MODEL_PROVIDER_IDS)[number];

// Image model capabilities
export type ImageModelCapabilities = {
  supportsGeneration: boolean;
  supportsEditing: boolean;
  supportedAspectRatios: string[];
  maxPromptLength: number;
};

// Image model configuration type
export type ImageModelConfigurationType = {
  providerId: ImageModelProviderIdType;
  modelId: string;
  displayName: string;
  description: string;
  shortDescription: string;
  capabilities: ImageModelCapabilities;
  isDefault: boolean;
  isLegacy: boolean;
  featureFlag?: WhitelistableFeature;
};

// Model IDs
export const GEMINI_2_5_FLASH_IMAGE_MODEL_ID =
  "gemini-2.5-flash-image" as const;
export const IMAGEN_3_MODEL_ID = "imagen-3.0-generate-002" as const;

// Future model IDs (uncomment when supported)
// export const OPENAI_DALL_E_3_MODEL_ID = "dall-e-3" as const;
// export const OPENAI_GPT_IMAGE_1_MODEL_ID = "gpt-image-1" as const;

// Supported image model configurations
export const GEMINI_2_5_FLASH_IMAGE_MODEL_CONFIG: ImageModelConfigurationType =
  {
    providerId: "google_ai_studio",
    modelId: GEMINI_2_5_FLASH_IMAGE_MODEL_ID,
    displayName: "Gemini 2.5 Flash",
    description: "Google's fast image generation model with editing support.",
    shortDescription: "Google's fast image model.",
    capabilities: {
      supportsGeneration: true,
      supportsEditing: true,
      supportedAspectRatios: ["1:1", "3:2", "2:3"],
      maxPromptLength: 4000,
    },
    isDefault: true,
    isLegacy: false,
  };

export const IMAGEN_3_MODEL_CONFIG: ImageModelConfigurationType = {
  providerId: "google_ai_studio",
  modelId: IMAGEN_3_MODEL_ID,
  displayName: "Imagen 3",
  description:
    "Google's highest quality image generation model. Best for photorealistic images.",
  shortDescription: "Google's highest quality model.",
  capabilities: {
    supportsGeneration: true,
    supportsEditing: false,
    supportedAspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    maxPromptLength: 4000,
  },
  isDefault: false,
  isLegacy: false,
};

// Array of all supported image model configurations
export const SUPPORTED_IMAGE_MODEL_CONFIGS: ImageModelConfigurationType[] = [
  GEMINI_2_5_FLASH_IMAGE_MODEL_CONFIG,
  IMAGEN_3_MODEL_CONFIG,
];

// Default image model (first model marked as default)
export const DEFAULT_IMAGE_MODEL_CONFIG = SUPPORTED_IMAGE_MODEL_CONFIGS.find(
  (m) => m.isDefault
)!;

// Array of all image model IDs
export const IMAGE_MODEL_IDS = SUPPORTED_IMAGE_MODEL_CONFIGS.map(
  (m) => m.modelId
);

export type ImageModelIdType = (typeof IMAGE_MODEL_IDS)[number];

// Type guard for image model ID
export const isImageModelId = (modelId: string): modelId is ImageModelIdType =>
  IMAGE_MODEL_IDS.includes(modelId);

// Type guard for image model provider ID
export const isImageModelProviderId = (
  providerId: string
): providerId is ImageModelProviderIdType =>
  IMAGE_MODEL_PROVIDER_IDS.includes(providerId as ImageModelProviderIdType);
