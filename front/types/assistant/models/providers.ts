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

export const ANTHROPIC_PROVIDER_ID = "anthropic";
export const OPENAI_PROVIDER_ID = "openai";
export const GOOGLE_AI_STUDIO_PROVIDER_ID = "google_ai_studio";

export const MODEL_PROVIDER_IDS = [
  OPENAI_PROVIDER_ID,
  ANTHROPIC_PROVIDER_ID,
  "mistral",
  GOOGLE_AI_STUDIO_PROVIDER_ID,
  "deepseek",
  "fireworks",
  "xai",
  "noop",
  "auto",
  "auto_fast",
  "auto_complex",
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
    case "auto_fast":
    case "auto_complex":
      return "Dust";
    default:
      return providerId;
  }
}
/**
 * MODEL MAKERS IDS
 */

export const MODEL_MAKER_ONLY_IDS = [
  "zai",
  "moonshot",
  "minimax",
  "thinking_machines",
] as const;

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
    case "thinking_machines":
      return "Thinking Machines Lab";
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
