// @vitest-environment node

import { OpenAIGptSixDotOneSolEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_six_dot_one_sol_eu_openai_responses";
import { INPUT_CONFIGURATION_ERROR } from "@app/lib/model_constructors/test/cases";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";
import { EnvironmentConfig } from "@app/types/shared/utils/config";

export const OpenAIGptSixDotOneSolEuropeOpenAIResponsesStreamSetup: StreamSetup =
  {
    createInstance: () =>
      new OpenAIGptSixDotOneSolEuropeOpenAIResponsesStream({
        OPENAI_API_KEY: EnvironmentConfig.getEnvVariable(
          "DUST_MANAGED_OPENAI_API_KEY"
        ),
      }),
    // Characterized against the live API (2026-09-30) with the widest
    // `inputConfigSchema`: "none" and "minimal" are rejected with a 400 listing
    // low/medium/high/xhigh/max, and every `temperature` other than 1 is
    // rejected. Global and EU rejected exactly the same cases.
    // `null` runs the case with its default checkers; a checker array overrides
    // them. Every case always runs.
    tests: {
      "simple/no-tools/t-default/r-default": null,
      "simple/no-tools/t-default/r-none": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-default/r-minimal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-default/r-low": null,
      "simple/no-tools/t-default/r-medium": null,
      "simple/no-tools/t-default/r-high": null,
      "simple/no-tools/t-default/r-xhigh": null,
      "simple/no-tools/t-default/r-maximal": null,
      "simple/no-tools/t-0/r-default": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-none": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-minimal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-low": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-medium": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-high": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-xhigh": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-maximal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-default": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-none": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-minimal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-low": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-medium": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-high": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-xhigh": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-maximal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-1/r-default": null,
      "simple/no-tools/t-1/r-none": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-1/r-minimal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-1/r-low": null,
      "simple/no-tools/t-1/r-medium": null,
      "simple/no-tools/t-1/r-high": null,
      "simple/no-tools/t-1/r-xhigh": null,
      "simple/no-tools/t-1/r-maximal": null,
      "calc/calc/t-default/r-medium": null,
      "calc/calc/t-0.1/r-default": [INPUT_CONFIGURATION_ERROR],
      "calc/calc/t-0.1/r-medium": [INPUT_CONFIGURATION_ERROR],
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

// NODE_ENV=test RUN_LLM_TEST=true npm run test -- --config lib/model_constructors/test/vite.config.js --bail 1 lib/model_constructors/test/endpoints/openai_gpt_six_dot_one_sol_eu_openai_responses.test.ts
runStreamEndpointTests(
  OpenAIGptSixDotOneSolEuropeOpenAIResponsesStream,
  OpenAIGptSixDotOneSolEuropeOpenAIResponsesStreamSetup
);
