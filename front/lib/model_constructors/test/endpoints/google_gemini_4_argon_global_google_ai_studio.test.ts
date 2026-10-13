// @vitest-environment node

import { GoogleGeminiFourArgonGlobalGoogleAiStudioStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_4_argon_global_google_ai_studio";
import { GEMINI_4_ARGON_TESTS } from "@app/lib/model_constructors/test/endpoints/google_gemini_4_argon";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

export const GoogleGeminiFourArgonGlobalGoogleAiStudioStreamSetup: StreamSetup =
  {
    createInstance: () =>
      new GoogleGeminiFourArgonGlobalGoogleAiStudioStream({
        GOOGLE_AI_STUDIO_API_KEY:
          process.env.DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY ?? "",
      }),
    tests: GEMINI_4_ARGON_TESTS,
  };

runStreamEndpointTests(
  GoogleGeminiFourArgonGlobalGoogleAiStudioStream,
  GoogleGeminiFourArgonGlobalGoogleAiStudioStreamSetup
);
