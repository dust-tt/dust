// @vitest-environment node

import { OpenAIGptFiveDotSixTerraLongContextEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_terra_long_context_eu_openai_responses";
import { INPUT_CONFIGURATION_ERROR } from "@app/lib/model_constructors/test/cases";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

export const OpenAIGptFiveDotSixTerraLongContextEuropeOpenAIResponsesStreamSetup: StreamSetup =
  {
    createInstance: () =>
      new OpenAIGptFiveDotSixTerraLongContextEuropeOpenAIResponsesStream({
        OPENAI_API_KEY: process.env.DUST_MANAGED_OPENAI_API_KEY ?? "",
      }),
    tests: {
      "simple/no-tools/t-default/r-default": null,
      "simple/no-tools/t-default/r-none": null,
      "simple/no-tools/t-default/r-minimal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-default/r-low": null,
      "simple/no-tools/t-default/r-medium": null,
      "simple/no-tools/t-default/r-high": null,
      "simple/no-tools/t-default/r-xhigh": null,
      "simple/no-tools/t-default/r-maximal": null,
      "simple/no-tools/t-0/r-default": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-none": null,
      "simple/no-tools/t-0/r-minimal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-low": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-medium": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-high": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-xhigh": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-maximal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-default": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-none": null,
      "simple/no-tools/t-0.1/r-minimal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-low": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-medium": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-high": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-xhigh": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-maximal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-1/r-default": null,
      "simple/no-tools/t-1/r-none": null,
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
      "calc/calc/t-default/r-none/force-tool": null,
      "reasoning/no-tools/t-default/r-none": null,
      "reasoning/no-tools/t-default/r-minimal": [INPUT_CONFIGURATION_ERROR],
      "reasoning/no-tools/t-default/r-low": null,
      "output-format/json-schema/t-default/r-none": null,
      "output-format/json-schema/t-default/r-high": null,
      "following/no-tools/t-default/r-default": null,
      "cache/no-tools/t-default/r-default": null,
    },
  };

runStreamEndpointTests(
  OpenAIGptFiveDotSixTerraLongContextEuropeOpenAIResponsesStream,
  OpenAIGptFiveDotSixTerraLongContextEuropeOpenAIResponsesStreamSetup
);
