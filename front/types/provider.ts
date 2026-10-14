import type { LLMCredentialsType } from "@app/types/provider_credential";
import { z } from "zod";

export type ProviderType = {
  providerId: string;
  config: string;
};

export type DustManagedCredentialsType = {
  SERP_API_KEY?: string;
  BROWSERLESS_API_KEY?: string;
  FIRECRAWL_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  SPIDER_API_KEY?: string;
  SERPER_API_KEY?: string;
  EXA_API_KEY?: string;
};

export type CredentialsType = DustManagedCredentialsType & LLMCredentialsType;

export const AzureOpenAIErrorResponseSchema = z.object({
  error: z.object({ message: z.string() }),
});
