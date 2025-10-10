import { ioTsEnum } from "@app/types/shared/utils/iots_utils";

export const DEFAULT_EMBEDDING_PROVIDER_ID = "openai";

export const EMBEDDING_PROVIDER_IDS = [
  DEFAULT_EMBEDDING_PROVIDER_ID,
  "mistral",
] as const;

export const EmbeddingProviderCodec = ioTsEnum<
  (typeof EMBEDDING_PROVIDER_IDS)[number]
>(EMBEDDING_PROVIDER_IDS);
