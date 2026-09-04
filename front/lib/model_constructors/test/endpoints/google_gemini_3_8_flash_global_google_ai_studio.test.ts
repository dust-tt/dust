// @vitest-environment node

import { GoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_8_flash_global_google_ai_studio";
import { GEMINI_3_8_FLASH_TESTS } from "@app/lib/model_constructors/test/endpoints/google_gemini_3_8_flash";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

export const GoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStreamSetup: StreamSetup =
  {
    createInstance: () =>
      new GoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStream({
        GOOGLE_AI_STUDIO_API_KEY:
          process.env.DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY ?? "",
      }),
    tests: GEMINI_3_8_FLASH_TESTS,
  };

runStreamEndpointTests(
  GoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStream,
  GoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStreamSetup
);
