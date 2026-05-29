import { anthropicClaudeSonnetFourDotSixSetup } from "@app/lib/model_constructors/_test_/setup/clients/anthropic/models/claude-sonnet-4-6";
import { geminiThreeDotOneProSetup } from "@app/lib/model_constructors/_test_/setup/clients/google-ai-studio/models/gemini-3.1-pro";
import { openaiGptFiveDotTwoSetup } from "@app/lib/model_constructors/_test_/setup/clients/openai-responses/models/gpt-5-2";
import { openaiGptFiveDotFourSetup } from "@app/lib/model_constructors/_test_/setup/clients/openai-responses/models/gpt-5-4";
import type { Setup } from "@app/lib/model_constructors/_test_/setup/types";
import type { LargeLanguageModelId } from "@app/lib/model_constructors/types/providers";

export const SETUPS: Record<LargeLanguageModelId, Setup> = {
  "openai/gpt-5.4": openaiGptFiveDotFourSetup,
  "openai/gpt-5.2": openaiGptFiveDotTwoSetup,
  "anthropic/claude-sonnet-4-6": anthropicClaudeSonnetFourDotSixSetup,
  "google-ai-studio/gemini-3.1-pro-preview": geminiThreeDotOneProSetup,
};
