import type {
  ByokModelProviderIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import { ioTsEnum } from "@app/types/shared/utils/iots_utils";
import { z } from "zod";

/**
 * PROVIDER IDS
 */

export const MODEL_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "mistral",
  "google_ai_studio",
  "togetherai",
  "deepseek",
  "fireworks",
  "xai",
  "noop",
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
    case "togetherai":
      return "TogetherAI";
    case "deepseek":
      return "DeepSeek";
    case "fireworks":
      return "Fireworks";
    case "xai":
      return "xAI";
    case "noop":
      return "noop";
    default:
      return providerId;
  }
}
export const isModelProviderId = (
  providerId: string
): providerId is ModelProviderIdType =>
  MODEL_PROVIDER_IDS.includes(providerId as ModelProviderIdType);
export const ModelProviderIdCodec =
  ioTsEnum<(typeof MODEL_PROVIDER_IDS)[number]>(MODEL_PROVIDER_IDS);
export const ModelProviderIdSchema = z.enum(MODEL_PROVIDER_IDS);
export const isByokProviderId = (
  providerId: ModelProviderIdType
): providerId is ByokModelProviderIdType =>
  BYOK_MODEL_PROVIDER_IDS.includes(providerId as ByokModelProviderIdType);
