import { z } from "zod";

export const DEFAULT_EMBEDDING_PROVIDER_ID = "openai";

export const EMBEDDING_PROVIDER_IDS = [
  DEFAULT_EMBEDDING_PROVIDER_ID,
  "mistral",
] as const;

export const EmbeddingProviderSchema = z.enum(EMBEDDING_PROVIDER_IDS);
