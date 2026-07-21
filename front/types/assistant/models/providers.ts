import type {
  ByokModelProviderIdType,
  ModelConfigurationType,
  ModelMakerIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import { z } from "zod";

/**
 * PROVIDER IDS
 */

export const MODEL_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "mistral",
  "google_ai_studio",
  "deepseek",
  "fireworks",
  "xai",
  "noop",
  "auto",
  "quick",
  "deep",
] as const;

export const BYOK_MODEL_PROVIDER_IDS = [
  "anthropic",
  "openai",
  "google_ai_studio",
] as const satisfies ModelProviderIdType[];

export function getProviderDisplayName(
  providerId: ModelProviderIdType
): string {
  switch (providerId) {
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "mistral":
      return "Mistral";
    case "google_ai_studio":
      return "Google";
    case "deepseek":
      return "DeepSeek";
    case "fireworks":
      return "Fireworks";
    case "xai":
      return "xAI";
    case "noop":
      return "noop";
    case "auto":
    case "quick":
    case "deep":
      return "Dust";
    default:
      return providerId;
  }
}
/**
 * MODEL MAKERS IDS
 */

export const MODEL_MAKER_ONLY_IDS = ["zai", "moonshot", "minimax"] as const;

export const MODEL_MAKER_IDS = [
  ...MODEL_PROVIDER_IDS,
  ...MODEL_MAKER_ONLY_IDS,
] as const;

// The maker of a model: its explicit `modelMaker` if set, otherwise the serving
// provider (which for native providers is also the maker).
export function getModelMaker(model: ModelConfigurationType): ModelMakerIdType {
  return model.modelMaker ?? model.providerId;
}

export function getModelMakerDisplayName(makerId: ModelMakerIdType): string {
  switch (makerId) {
    case "zai":
      return "Z.ai";
    case "moonshot":
      return "Moonshot AI";
    case "minimax":
      return "MiniMax";
    default:
      return getProviderDisplayName(makerId);
  }
}

export const isModelProviderId = (
  providerId: string
): providerId is ModelProviderIdType =>
  MODEL_PROVIDER_IDS.includes(providerId as ModelProviderIdType);
export const ModelProviderIdSchema = z.enum(MODEL_PROVIDER_IDS);
export const isByokProviderId = (
  providerId: ModelProviderIdType
): providerId is ByokModelProviderIdType =>
  BYOK_MODEL_PROVIDER_IDS.includes(providerId as ByokModelProviderIdType);
