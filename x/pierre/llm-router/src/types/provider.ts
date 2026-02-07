import { OPENAI_PROVIDER_ID } from "@/providers/openai/types";

export const PROVIDER_IDS = [OPENAI_PROVIDER_ID] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
