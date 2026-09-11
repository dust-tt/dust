// @vitest-environment node

import { ZAiGlmFiveDotThreeGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/z_ai_glm_five_dot_three_global_fireworks";
import { INPUT_CONFIGURATION_ERROR } from "@app/lib/model_constructors/test/cases";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

export const ZAiGlmFiveDotThreeGlobalFireworksStreamSetup: StreamSetup = {
  createInstance: () =>
    new ZAiGlmFiveDotThreeGlobalFireworksStream({
      FIREWORKS_API_KEY: process.env.DUST_MANAGED_FIREWORKS_API_KEY ?? "",
    }),
  tests: {
    "simple/no-tools/t-default/r-default": null,
    "simple/no-tools/t-default/r-none": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-default/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-default/r-low": null,
    "simple/no-tools/t-default/r-medium": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-default/r-high": null,
    "simple/no-tools/t-default/r-xhigh": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-default/r-maximal": null,
    "simple/no-tools/t-0/r-default": null,
    "simple/no-tools/t-0/r-none": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-low": null,
    "simple/no-tools/t-0/r-medium": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-high": null,
    "simple/no-tools/t-0/r-xhigh": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-maximal": null,
    "simple/no-tools/t-0.1/r-default": null,
    "simple/no-tools/t-0.1/r-none": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-low": null,
    "simple/no-tools/t-0.1/r-medium": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-high": null,
    "simple/no-tools/t-0.1/r-xhigh": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-maximal": null,
    "simple/no-tools/t-1/r-default": null,
    "simple/no-tools/t-1/r-none": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-low": null,
    "simple/no-tools/t-1/r-medium": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-high": null,
    "simple/no-tools/t-1/r-xhigh": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-maximal": null,
    "calc/calc/t-default/r-medium": [INPUT_CONFIGURATION_ERROR],
    "calc/calc/t-0.1/r-default": null,
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

// NODE_ENV=test RUN_LLM_TEST=true npm run test -- --config lib/model_constructors/test/vite.config.js lib/model_constructors/test/endpoints/z_ai_glm_five_dot_three_global_fireworks.test.ts
runStreamEndpointTests(
  ZAiGlmFiveDotThreeGlobalFireworksStream,
  ZAiGlmFiveDotThreeGlobalFireworksStreamSetup
);
