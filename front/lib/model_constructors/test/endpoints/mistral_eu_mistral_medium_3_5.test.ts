// @vitest-environment node

import { MistralEuropeMistralMedium35Stream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_mistral_medium_3_5";
import { INPUT_CONFIGURATION_ERROR } from "@app/lib/model_constructors/test/cases";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

const setup: StreamSetup = {
  createInstance: () =>
    new MistralEuropeMistralMedium35Stream({
      MISTRAL_API_KEY: process.env.DUST_MANAGED_MISTRAL_API_KEY ?? "",
    }),
  // Mistral Medium 3.5 is a reasoning model: it accepts `none` and `high`. Other
  // reasoning efforts are rejected by the config schema.
  tests: {
    "simple/no-tools/t-default/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-default/r-low": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-default/r-medium": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-default/r-maximal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-low": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-medium": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-maximal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-low": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-medium": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-maximal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-low": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-medium": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-maximal": [INPUT_CONFIGURATION_ERROR],
    "calc/calc/t-default/r-medium": [INPUT_CONFIGURATION_ERROR],
    "calc/calc/t-0.1/r-medium": [INPUT_CONFIGURATION_ERROR],
    "reasoning/no-tools/t-default/r-low": [INPUT_CONFIGURATION_ERROR],

    // Supported (`none`/`high`/default) cases run with their default checkers.
    "simple/no-tools/t-default/r-default": null,
    "simple/no-tools/t-default/r-none": null,
    "simple/no-tools/t-default/r-high": null,
    "simple/no-tools/t-0/r-default": null,
    "simple/no-tools/t-0/r-none": null,
    "simple/no-tools/t-0/r-high": null,
    "simple/no-tools/t-0.1/r-default": null,
    "simple/no-tools/t-0.1/r-none": null,
    "simple/no-tools/t-0.1/r-high": null,
    "simple/no-tools/t-1/r-default": null,
    "simple/no-tools/t-1/r-none": null,
    "simple/no-tools/t-1/r-high": null,

    "cache/no-tools/t-default/r-default": null,

    "calc/calc/t-0.1/r-default": null,
    "calc/calc/t-default/r-default/force-tool-default": null,
    "calc/calc/t-default/r-default/force-tool": null,
    "calc/calc/t-default/r-none/force-tool": null,

    "reasoning/no-tools/t-default/r-none": null,

    "output-format/json-schema/t-default/r-none": null,
    "output-format/json-schema/t-default/r-high": null,

    "following/no-tools/t-default/r-default": null,
  },
};

// NODE_ENV=test RUN_LLM_TEST=true npm run test -- --config lib/model_constructors/test/vite.config.js --bail 1 lib/model_constructors/test/endpoints/mistral_eu_mistral_medium_3_5.test.ts
runStreamEndpointTests(MistralEuropeMistralMedium35Stream, setup);
