// @vitest-environment node

import { GoogleGeminiThreeDotOneProGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_1_pro_global_agent_platform";
import { INPUT_CONFIGURATION_ERROR } from "@app/lib/model_constructors/test/cases";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

export const GoogleGeminiThreeDotOneProGlobalAgentPlatformStreamSetup: StreamSetup =
  {
    createInstance: () =>
      new GoogleGeminiThreeDotOneProGlobalAgentPlatformStream({
        AGENT_PLATFORM_PROJECT_ID: process.env.VERTEX_AI_PROJECT_ID ?? "",
      }),
    // `null` runs the case with its default checkers; a checker array overrides
    // them. Every case always runs.
    //
    // Verified against the live API (2026-07-27) by running this suite with the
    // widest `inputConfigSchema`; AI Studio and Vertex reject the same inputs.
    // Gemini accepts the full 0..2 temperature range in every thinking mode, so
    // no `t-*` case is a configuration error. What the schema rejects:
    //
    //   - `xhigh` / `maximal` — no Gemini equivalent, they `assertNever` in the
    //     converter.
    //   - `minimal` — "Thinking level MINIMAL is not supported for this model".
    //   - `none` — thinking cannot be turned off: `thinkingBudget: 0` is
    //     rejected, so the model has no thinking-off effort.
    tests: {
      "simple/no-tools/t-default/r-default": null,
      "simple/no-tools/t-default/r-none": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-default/r-minimal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-default/r-low": null,
      "simple/no-tools/t-default/r-medium": null,
      "simple/no-tools/t-default/r-high": null,
      "simple/no-tools/t-default/r-xhigh": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-default/r-maximal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-default": null,
      "simple/no-tools/t-0/r-none": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-minimal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-low": null,
      "simple/no-tools/t-0/r-medium": null,
      "simple/no-tools/t-0/r-high": null,
      "simple/no-tools/t-0/r-xhigh": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-maximal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-default": null,
      "simple/no-tools/t-0.1/r-none": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-minimal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-low": null,
      "simple/no-tools/t-0.1/r-medium": null,
      "simple/no-tools/t-0.1/r-high": null,
      "simple/no-tools/t-0.1/r-xhigh": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-maximal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-1/r-default": null,
      "simple/no-tools/t-1/r-none": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-1/r-minimal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-1/r-low": null,
      "simple/no-tools/t-1/r-medium": null,
      "simple/no-tools/t-1/r-high": null,
      "simple/no-tools/t-1/r-xhigh": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-1/r-maximal": [INPUT_CONFIGURATION_ERROR],
      "calc/calc/t-default/r-medium": null,
      "calc/calc/t-0.1/r-default": null,
      "calc/calc/t-0.1/r-medium": null,
      "calc/calc/t-default/r-default/force-tool-default": null,
      "calc/calc/t-default/r-default/force-tool": null,
      "calc/calc/t-default/r-high/force-tool": null,
      "calc/calc/t-default/r-none/force-tool": [INPUT_CONFIGURATION_ERROR],
      "reasoning/no-tools/t-default/r-none": [INPUT_CONFIGURATION_ERROR],
      "reasoning/no-tools/t-default/r-minimal": [INPUT_CONFIGURATION_ERROR],
      "reasoning/no-tools/t-default/r-low": null,
      "output-format/json-schema/t-default/r-none": [INPUT_CONFIGURATION_ERROR],
      "output-format/json-schema/t-default/r-high": null,
      "following/no-tools/t-default/r-default": null,
      "cache/no-tools/t-default/r-default": null,
    },
  };

// NODE_ENV=test RUN_LLM_TEST=true npm run test -- --config lib/model_constructors/test/vite.config.js --bail 1 lib/model_constructors/test/endpoints/google_gemini_3_1_pro_global_agent_platform.test.ts
runStreamEndpointTests(
  GoogleGeminiThreeDotOneProGlobalAgentPlatformStream,
  GoogleGeminiThreeDotOneProGlobalAgentPlatformStreamSetup
);
