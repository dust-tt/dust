// @vitest-environment node

import { AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_gemini_3_1_flash_lite";
import {
  INPUT_CONFIGURATION_ERROR,
  SUCCESS,
} from "@app/lib/model_constructors/test/cases";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

const setup: StreamSetup = {
  createInstance: () =>
    new AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream({
      AGENT_PLATFORM_PROJECT_ID: process.env.VERTEX_AI_PROJECT_ID ?? "",
    }),
  // `null` runs the case with its default checkers; a checker array overrides
  // them. Every case always runs.
  tests: {
    // Flash-Lite supports none/minimal/low/medium/high. `maximal` is
    // unsupported and rejected by the config schema. `none` maps to the minimum
    // thinking budget with thoughts hidden (legacy parity).
    "simple/no-tools/t-default/r-maximal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-maximal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-maximal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-maximal": [INPUT_CONFIGURATION_ERROR],

    "simple/no-tools/t-default/r-none": null,
    "simple/no-tools/t-0/r-none": null,
    "simple/no-tools/t-0.1/r-none": null,
    "simple/no-tools/t-1/r-none": null,
    "calc/calc/t-default/r-none/force-tool": null,
    "reasoning/no-tools/t-default/r-none": null,
    "output-format/json-schema/t-default/r-none": null,

    "simple/no-tools/t-default/r-minimal": null,
    "simple/no-tools/t-0/r-minimal": null,
    "simple/no-tools/t-0.1/r-minimal": null,
    "simple/no-tools/t-1/r-minimal": null,

    "simple/no-tools/t-default/r-default": null,
    "simple/no-tools/t-default/r-low": null,
    "simple/no-tools/t-default/r-medium": null,
    "simple/no-tools/t-default/r-high": null,
    "simple/no-tools/t-0/r-default": null,
    "simple/no-tools/t-0/r-low": null,
    "simple/no-tools/t-0/r-medium": null,
    "simple/no-tools/t-0/r-high": null,
    "simple/no-tools/t-0.1/r-default": null,
    "simple/no-tools/t-0.1/r-low": null,
    "simple/no-tools/t-0.1/r-medium": null,
    "simple/no-tools/t-0.1/r-high": null,
    "simple/no-tools/t-1/r-default": null,
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

    // Unlike Pro/Flash, this lightweight model does not reliably surface thought
    // content at `low` effort, so we only assert the stream completes.
    "reasoning/no-tools/t-default/r-low": [SUCCESS],

    "output-format/json-schema/t-default/r-high": null,

    "following/no-tools/t-default/r-default": null,
  },
};

// NODE_ENV=test RUN_LLM_TEST=true npm run test -- --config lib/model_constructors/test/vite.config.js --bail 1 lib/model_constructors/test/endpoints/agent_platform_eu_gemini_3_1_flash_lite.test.ts
runStreamEndpointTests(
  AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream,
  setup
);
