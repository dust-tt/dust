import { anthropicClaudeSonnetFourDotSixSetup } from "@app/lib/model_constructors/_test_/setup/clients/anthropic/models/claude-sonnet-4-6";
import { geminiThreeDotOneProSetup } from "@app/lib/model_constructors/_test_/setup/clients/google-ai-studio/models/gemini-3.1-pro";
import { openaiGptFiveDotTwoSetup } from "@app/lib/model_constructors/_test_/setup/clients/openai-responses/models/gpt-5-2";
import { openaiGptFiveDotFourSetup } from "@app/lib/model_constructors/_test_/setup/clients/openai-responses/models/gpt-5-4";
import type { Setup } from "@app/lib/model_constructors/_test_/setup/types";
import type { ModelEndpointId } from "@app/lib/model_constructors/types/model-endpoints";

export const SETUPS: Record<ModelEndpointId, Setup> = {
  "openai/openai/global/gpt-5.4": openaiGptFiveDotFourSetup,
  "openai/openai/global/gpt-5.2": openaiGptFiveDotTwoSetup,
  "anthropic/anthropic/global/claude-sonnet-4-6":
    anthropicClaudeSonnetFourDotSixSetup,
  "google-ai-studio/google-ai-studio/global/gemini-3.1-pro-preview":
    geminiThreeDotOneProSetup,
};
