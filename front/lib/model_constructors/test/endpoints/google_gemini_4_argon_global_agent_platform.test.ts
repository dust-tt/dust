// @vitest-environment node

import { GoogleGeminiFourArgonGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_4_argon_global_agent_platform";
import { GEMINI_4_ARGON_TESTS } from "@app/lib/model_constructors/test/endpoints/google_gemini_4_argon";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

export const GoogleGeminiFourArgonGlobalAgentPlatformStreamSetup: StreamSetup =
  {
    createInstance: () =>
      new GoogleGeminiFourArgonGlobalAgentPlatformStream({
        AGENT_PLATFORM_PROJECT_ID: process.env.VERTEX_AI_PROJECT_ID ?? "",
      }),
    tests: GEMINI_4_ARGON_TESTS,
  };

runStreamEndpointTests(
  GoogleGeminiFourArgonGlobalAgentPlatformStream,
  GoogleGeminiFourArgonGlobalAgentPlatformStreamSetup
);
