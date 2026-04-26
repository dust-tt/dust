import { Setup } from "@/_test_/setup/types";
import { openaiGptFiveDotFourSetup } from "@/_test_/setup/clients/openai-responses/models/gpt-5-4";
import type { LargeLanguageModelId } from "@/types/providers";
import { openaiGptFiveDotTwoSetup } from "@/_test_/setup/clients/openai-responses/models/gpt-5-2";

export const SETUPS: Record<LargeLanguageModelId, Setup> = {
  "openai/gpt-5.4": openaiGptFiveDotFourSetup,
  "openai/gpt-5.2": openaiGptFiveDotTwoSetup,
};
