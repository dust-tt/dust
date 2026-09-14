// @vitest-environment node

import { GoogleGeminiThreeDotSixFlashEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_6_flash_eu_agent_platform";
import {
  INPUT_CONFIGURATION_ERROR,
  SUCCESS,
} from "@app/lib/model_constructors/test/cases";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

export const GoogleGeminiThreeDotSixFlashEuropeAgentPlatformStreamSetup: StreamSetup =
  {
    createInstance: () =>
      new GoogleGeminiThreeDotSixFlashEuropeAgentPlatformStream({
        AGENT_PLATFORM_PROJECT_ID: process.env.VERTEX_AI_PROJECT_ID ?? "",
      }),
    // `null` runs the case with its default checkers; a checker array overrides
    // them. Every case always runs.
    tests: {
      // Flash supports minimal/low/medium/high. `none`, `xhigh` and `maximal`
      // are unsupported and rejected by the config schema.
      "simple/no-tools/t-default/r-none": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-default/r-maximal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-default/r-xhigh": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-none": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-maximal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-xhigh": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-none": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-maximal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-xhigh": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-1/r-none": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-1/r-maximal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-1/r-xhigh": [INPUT_CONFIGURATION_ERROR],
      "calc/calc/t-default/r-none/force-tool": [INPUT_CONFIGURATION_ERROR],
      "reasoning/no-tools/t-default/r-none": [INPUT_CONFIGURATION_ERROR],
      "output-format/json-schema/t-default/r-none": [INPUT_CONFIGURATION_ERROR],

      "simple/no-tools/t-default/r-default": null,
      "simple/no-tools/t-default/r-minimal": null,
      "simple/no-tools/t-default/r-low": null,
      "simple/no-tools/t-default/r-medium": null,
      "simple/no-tools/t-default/r-high": null,
      "simple/no-tools/t-0/r-default": null,
      "simple/no-tools/t-0/r-minimal": null,
      "simple/no-tools/t-0/r-low": null,
      "simple/no-tools/t-0/r-medium": null,
      "simple/no-tools/t-0/r-high": null,
      "simple/no-tools/t-0.1/r-default": null,
      "simple/no-tools/t-0.1/r-minimal": null,
      "simple/no-tools/t-0.1/r-low": null,
      "simple/no-tools/t-0.1/r-medium": null,
      "simple/no-tools/t-0.1/r-high": null,
      "simple/no-tools/t-1/r-default": null,
      "simple/no-tools/t-1/r-minimal": null,
      "simple/no-tools/t-1/r-low": null,
      "simple/no-tools/t-1/r-medium": null,
      "simple/no-tools/t-1/r-high": null,

      // Gemini ignores the Anthropic-style cache markers (it uses implicit
      // caching), so this behaves like a plain "say Hi" prompt.
      "cache/no-tools/t-default/r-default": null,

      "calc/calc/t-default/r-medium": null,
      "calc/calc/t-0.1/r-default": null,
      "calc/calc/t-0.1/r-medium": null,

      "calc/calc/t-default/r-default/force-tool-default": null,
      "calc/calc/t-default/r-default/force-tool": null,
      "calc/calc/t-default/r-high/force-tool": null,

      // Thinking hardly ever occurs at this effort — the model returned 0
      // thought tokens here, so `HAS_REASONING` would assert a model
      // decision rather than an API contract; assert success only.
      "reasoning/no-tools/t-default/r-minimal": [SUCCESS],
      "reasoning/no-tools/t-default/r-low": null,

      "output-format/json-schema/t-default/r-high": null,

      "following/no-tools/t-default/r-default": null,
    },
  };

// NODE_ENV=test RUN_LLM_TEST=true npm run test -- --config lib/model_constructors/test/vite.config.js --bail 1 lib/model_constructors/test/endpoints/google_gemini_3_6_flash_eu_agent_platform.test.ts
runStreamEndpointTests(
  GoogleGeminiThreeDotSixFlashEuropeAgentPlatformStream,
  GoogleGeminiThreeDotSixFlashEuropeAgentPlatformStreamSetup
);
