// @vitest-environment node

import { ThinkingMachinesInklingGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/thinking_machines_inkling_global_fireworks";
import {
  HAS_REASONING,
  INPUT_CONFIGURATION_ERROR,
} from "@app/lib/model_constructors/test/cases";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

export const ThinkingMachinesInklingGlobalFireworksStreamSetup: StreamSetup = {
  createInstance: () =>
    new ThinkingMachinesInklingGlobalFireworksStream({
      FIREWORKS_API_KEY: process.env.DUST_MANAGED_FIREWORKS_API_KEY ?? "",
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
    "simple/no-tools/t-0/r-default": null,
    "simple/no-tools/t-0/r-none": null,
    "simple/no-tools/t-0/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-low": null,
    "simple/no-tools/t-0/r-medium": null,
    "simple/no-tools/t-0/r-high": null,
    "simple/no-tools/t-0/r-xhigh": null,
    "simple/no-tools/t-0/r-maximal": null,
    "simple/no-tools/t-0.1/r-default": null,
    "simple/no-tools/t-0.1/r-none": null,
    "simple/no-tools/t-0.1/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-low": null,
    "simple/no-tools/t-0.1/r-medium": null,
    "simple/no-tools/t-0.1/r-high": null,
    "simple/no-tools/t-0.1/r-xhigh": null,
    "simple/no-tools/t-0.1/r-maximal": null,
    "simple/no-tools/t-1/r-default": null,
    "simple/no-tools/t-1/r-none": null,
    "simple/no-tools/t-1/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-low": null,
    "simple/no-tools/t-1/r-medium": null,
    "simple/no-tools/t-1/r-high": null,
    "simple/no-tools/t-1/r-xhigh": null,
    "simple/no-tools/t-1/r-maximal": null,
    "calc/calc/t-default/r-medium": null,
    "calc/calc/t-0.1/r-default": null,
    "calc/calc/t-0.1/r-medium": null,
    "calc/calc/t-default/r-default/force-tool-default": null,
    "calc/calc/t-default/r-default/force-tool": [INPUT_CONFIGURATION_ERROR],
    "calc/calc/t-default/r-high/force-tool": [INPUT_CONFIGURATION_ERROR],
    "calc/calc/t-default/r-none/force-tool": [INPUT_CONFIGURATION_ERROR],
    "reasoning/no-tools/t-default/r-none": [HAS_REASONING],
    "reasoning/no-tools/t-default/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "reasoning/no-tools/t-default/r-low": null,
    "output-format/json-schema/t-default/r-none": null,
    "output-format/json-schema/t-default/r-high": null,
    "following/no-tools/t-default/r-default": null,
    "cache/no-tools/t-default/r-default": null,
  },
};

// NODE_ENV=test RUN_LLM_TEST=true npm run test -- --config lib/model_constructors/test/vite.config.js lib/model_constructors/test/endpoints/thinking_machines_inkling_global_fireworks.test.ts
runStreamEndpointTests(
  ThinkingMachinesInklingGlobalFireworksStream,
  ThinkingMachinesInklingGlobalFireworksStreamSetup
);
