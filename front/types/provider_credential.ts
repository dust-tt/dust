import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import type { ModelId } from "@app/types/shared/model_id";
import { z } from "zod";

export type LLMCredentialsType = {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_USE_EU_ENDPOINT?: string;
  ANTHROPIC_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  GOOGLE_AI_STUDIO_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  FIREWORKS_API_KEY?: string;
  XAI_API_KEY?: string;
  TOGETHERAI_API_KEY?: string;
  // Azure OpenAI and TextSynth are not in ModelProviderIdType yet.
  AZURE_OPENAI_API_KEY?: string;
  AZURE_OPENAI_ENDPOINT?: string;
  TEXTSYNTH_API_KEY?: string;
};

export type ProviderCredentialType = {
  sId: string;
  createdAt: number;
  updatedAt: number;
  providerId: ModelProviderIdType;
  credentialId: string;
  isHealthy: boolean;
  placeholder: string;
  editedByUserId: ModelId | null;
};

const ApiKeyCredentialContentSchema = z.object({
  api_key: z.string(),
});

export const OpenAICredentialContentSchema =
  ApiKeyCredentialContentSchema.extend({
    base_url: z.string().optional(),
  });

export const PROVIDER_CREDENTIAL_CONTENT_SCHEMAS = {
  openai: OpenAICredentialContentSchema,
  anthropic: ApiKeyCredentialContentSchema,
  mistral: ApiKeyCredentialContentSchema,
  google_ai_studio: ApiKeyCredentialContentSchema,
  deepseek: ApiKeyCredentialContentSchema,
  fireworks: ApiKeyCredentialContentSchema,
  xai: ApiKeyCredentialContentSchema,
  togetherai: ApiKeyCredentialContentSchema,
} as const satisfies Record<
  Exclude<ModelProviderIdType, "noop">,
  typeof ApiKeyCredentialContentSchema
>;

export const PROVIDER_TO_CREDENTIAL_KEY = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  mistral: "MISTRAL_API_KEY",
  google_ai_studio: "GOOGLE_AI_STUDIO_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  fireworks: "FIREWORKS_API_KEY",
  xai: "XAI_API_KEY",
  togetherai: "TOGETHERAI_API_KEY",
} as const satisfies Record<
  Exclude<ModelProviderIdType, "noop">,
  keyof LLMCredentialsType
>;
