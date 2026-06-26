// @vitest-environment node

import { OpenAIResponsesGlobalGptFiveNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_nano";
import { INPUT_CONFIGURATION_ERROR } from "@app/lib/model_constructors/test/cases";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

const setup: StreamSetup = {
  createInstance: () =>
    new OpenAIResponsesGlobalGptFiveNanoStream({
      OPENAI_API_KEY: process.env.DUST_MANAGED_OPENAI_API_KEY ?? "",
    }),
  // `null` runs the case with its default checkers; a checker array overrides
  // them. Every case always runs.
  tests: {
    // gpt-5-nano supports "minimal" reasoning (unlike gpt-5.5), so these pass.
    "simple/no-tools/t-default/r-minimal": null,
    "simple/no-tools/t-0/r-minimal": null,
    "simple/no-tools/t-0.1/r-minimal": null,
    "simple/no-tools/t-1/r-minimal": null,
    // "none" maps to "minimal", so it runs normally. "maximal" (→ xhigh) is
    // unsupported and rejected locally.
    "simple/no-tools/t-default/r-maximal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-maximal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-maximal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-maximal": [INPUT_CONFIGURATION_ERROR],
    // The Responses API accepts a forced tool without requiring reasoning
    // "none", so this is a normal tool call.
    "calc/calc/t-default/r-default/force-tool": null,

    "simple/no-tools/t-default/r-default": null,
    "simple/no-tools/t-default/r-none": null,
    "simple/no-tools/t-default/r-low": null,
    "simple/no-tools/t-default/r-medium": null,
    "simple/no-tools/t-default/r-high": null,
    "simple/no-tools/t-0/r-default": null,
    "simple/no-tools/t-0/r-none": null,
    "simple/no-tools/t-0/r-low": null,
    "simple/no-tools/t-0/r-medium": null,
    "simple/no-tools/t-0/r-high": null,
    "simple/no-tools/t-0.1/r-default": null,
    "simple/no-tools/t-0.1/r-none": null,
    "simple/no-tools/t-0.1/r-low": null,
    "simple/no-tools/t-0.1/r-medium": null,
    "simple/no-tools/t-0.1/r-high": null,
    "simple/no-tools/t-1/r-default": null,
    "simple/no-tools/t-1/r-none": null,
    "simple/no-tools/t-1/r-low": null,
    "simple/no-tools/t-1/r-medium": null,
    "simple/no-tools/t-1/r-high": null,

    "calc/calc/t-default/r-medium": null,
    "calc/calc/t-0.1/r-default": null,
    "calc/calc/t-0.1/r-medium": null,

    "calc/calc/t-default/r-default/force-tool-default": null,
    "calc/calc/t-default/r-none/force-tool": null,

    "reasoning/no-tools/t-default/r-none": null,
    "reasoning/no-tools/t-default/r-low": null,

    "output-format/json-schema/t-default/r-none": null,
    "output-format/json-schema/t-default/r-high": null,

    "following/no-tools/t-default/r-default": null,

    "cache/no-tools/t-default/r-default": null,
  },
};

// NODE_ENV=test RUN_LLM_TEST=true npm run test -- --config lib/model_constructors/test/vite.config.js --bail 1 lib/model_constructors/test/endpoints/openai_responses_global_gpt_five_nano.test.ts
runStreamEndpointTests(OpenAIResponsesGlobalGptFiveNanoStream, setup);
