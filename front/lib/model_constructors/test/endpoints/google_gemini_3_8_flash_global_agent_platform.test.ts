// @vitest-environment node

import { GoogleGeminiThreeDotEightFlashGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_8_flash_global_agent_platform";
import { GEMINI_3_8_FLASH_TESTS } from "@app/lib/model_constructors/test/endpoints/google_gemini_3_8_flash";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

export const GoogleGeminiThreeDotEightFlashGlobalAgentPlatformStreamSetup: StreamSetup =
  {
    createInstance: () =>
      new GoogleGeminiThreeDotEightFlashGlobalAgentPlatformStream({
        AGENT_PLATFORM_PROJECT_ID: process.env.VERTEX_AI_PROJECT_ID ?? "",
      }),
    tests: GEMINI_3_8_FLASH_TESTS,
  };

runStreamEndpointTests(
  GoogleGeminiThreeDotEightFlashGlobalAgentPlatformStream,
  GoogleGeminiThreeDotEightFlashGlobalAgentPlatformStreamSetup
);
