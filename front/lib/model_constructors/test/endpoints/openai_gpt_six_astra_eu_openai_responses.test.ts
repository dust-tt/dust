// @vitest-environment node

import { OpenAIGptSixAstraEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_six_astra_eu_openai_responses";
import { INPUT_CONFIGURATION_ERROR } from "@app/lib/model_constructors/test/cases";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

export const OpenAIGptSixAstraEuropeOpenAIResponsesStreamSetup: StreamSetup = {
  createInstance: () =>
    new OpenAIGptSixAstraEuropeOpenAIResponsesStream({
      OPENAI_API_KEY: process.env.DUST_MANAGED_OPENAI_API_KEY ?? "",
    }),
  // `null` runs the case with its default checkers; a checker array overrides
  // them. Every case always runs.
  tests: {
    // "none" and "minimal" are unsupported. "maximal" maps to OpenAI's native
    // "max" and is accepted.
    "simple/no-tools/t-default/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-default/r-maximal": null,
    "simple/no-tools/t-0/r-maximal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-maximal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-maximal": null,
    // Unlike Anthropic, the Responses API accepts a forced tool without
    // requiring reasoning "none", so this is a normal tool call.
    "calc/calc/t-default/r-default/force-tool": null,
    "calc/calc/t-default/r-high/force-tool": null,

    "simple/no-tools/t-default/r-default": null,
    "simple/no-tools/t-default/r-none": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-default/r-low": null,
    "simple/no-tools/t-default/r-medium": null,
    "simple/no-tools/t-default/r-high": null,
    "simple/no-tools/t-default/r-xhigh": null,
    "simple/no-tools/t-0/r-default": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-none": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-low": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-medium": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-high": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-xhigh": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-default": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-none": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-low": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-medium": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-high": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-xhigh": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-default": null,
    "simple/no-tools/t-1/r-none": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-low": null,
    "simple/no-tools/t-1/r-medium": null,
    "simple/no-tools/t-1/r-high": null,
    "simple/no-tools/t-1/r-xhigh": null,

    "calc/calc/t-default/r-medium": null,
    "calc/calc/t-0.1/r-default": [INPUT_CONFIGURATION_ERROR],
    "calc/calc/t-0.1/r-medium": [INPUT_CONFIGURATION_ERROR],

    "calc/calc/t-default/r-default/force-tool-default": null,
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

// NODE_ENV=test RUN_LLM_TEST=true npm run test -- --config lib/model_constructors/test/vite.config.js --bail 1 lib/model_constructors/test/endpoints/openai_gpt_six_astra_eu_openai_responses.test.ts
runStreamEndpointTests(
  OpenAIGptSixAstraEuropeOpenAIResponsesStream,
  OpenAIGptSixAstraEuropeOpenAIResponsesStreamSetup
);
