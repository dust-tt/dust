// @vitest-environment node

import { DeepSeekDeepSeekV4Pro0813GlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/deepseek_deepseek_v4_pro_0813_global_fireworks";
import {
  INPUT_CONFIGURATION_ERROR,
  SUCCESS,
} from "@app/lib/model_constructors/test/cases";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

export const DeepSeekDeepSeekV4Pro0813GlobalFireworksStreamSetup: StreamSetup =
  {
    createInstance: () =>
      new DeepSeekDeepSeekV4Pro0813GlobalFireworksStream({
        FIREWORKS_API_KEY: process.env.DUST_MANAGED_FIREWORKS_API_KEY ?? "",
      }),
    tests: {
      "simple/no-tools/t-default/r-default": null,
      "simple/no-tools/t-default/r-none": null,
      "simple/no-tools/t-default/r-minimal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-default/r-low": null,
      "simple/no-tools/t-default/r-medium": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-default/r-high": null,
      "simple/no-tools/t-default/r-xhigh": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-default/r-maximal": null,
      "simple/no-tools/t-0/r-default": null,
      "simple/no-tools/t-0/r-none": null,
      "simple/no-tools/t-0/r-minimal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-low": null,
      "simple/no-tools/t-0/r-medium": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-high": null,
      "simple/no-tools/t-0/r-xhigh": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0/r-maximal": null,
      "simple/no-tools/t-0.1/r-default": null,
      "simple/no-tools/t-0.1/r-none": null,
      "simple/no-tools/t-0.1/r-minimal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-low": null,
      "simple/no-tools/t-0.1/r-medium": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-high": null,
      "simple/no-tools/t-0.1/r-xhigh": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-0.1/r-maximal": null,
      "simple/no-tools/t-1/r-default": null,
      "simple/no-tools/t-1/r-none": null,
      "simple/no-tools/t-1/r-minimal": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-1/r-low": null,
      "simple/no-tools/t-1/r-medium": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-1/r-high": null,
      "simple/no-tools/t-1/r-xhigh": [INPUT_CONFIGURATION_ERROR],
      "simple/no-tools/t-1/r-maximal": null,
      "calc/calc/t-default/r-medium": [INPUT_CONFIGURATION_ERROR],
      // Tool choice is the model's to make here: 0813 mostly answers this
      // arithmetic itself rather than calling the calculator, but not
      // consistently — 2 of 3 runs on 2026-09-07 skipped the tool, 1 used it.
      // An intermittent choice cannot be asserted in either direction, and it
      // is a model decision rather than an API contract, so assert only that
      // the call succeeds. The `force-tool` cases below cover the tool-calling
      // path itself, and they pass.
      "calc/calc/t-0.1/r-default": [SUCCESS],
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

// NODE_ENV=test RUN_LLM_TEST=true npm run test -- --config lib/model_constructors/test/vite.config.js --bail 1 lib/model_constructors/test/endpoints/deepseek_deepseek_v4_pro_0813_global_fireworks.test.ts
runStreamEndpointTests(
  DeepSeekDeepSeekV4Pro0813GlobalFireworksStream,
  DeepSeekDeepSeekV4Pro0813GlobalFireworksStreamSetup
);
