// @vitest-environment node

import { MoonshotAiKimiK2Dot6GlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/moonshot_ai_kimi_k2_dot_six_global_fireworks";
import { INPUT_CONFIGURATION_ERROR } from "@app/lib/model_constructors/test/cases";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

export const MoonshotAiKimiK2Dot6GlobalFireworksStreamSetup: StreamSetup = {
  createInstance: () =>
    new MoonshotAiKimiK2Dot6GlobalFireworksStream({
      FIREWORKS_API_KEY: process.env.DUST_MANAGED_FIREWORKS_API_KEY ?? "",
    }),
  tests: {
    "simple/no-tools/t-default/r-default": null,
    "simple/no-tools/t-default/r-none": null,
    "simple/no-tools/t-default/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-default/r-low": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-default/r-medium": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-default/r-high": null,
    "simple/no-tools/t-default/r-xhigh": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-default/r-maximal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-default": null,
    "simple/no-tools/t-0/r-none": null,
    "simple/no-tools/t-0/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-low": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-medium": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-high": null,
    "simple/no-tools/t-0/r-xhigh": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-maximal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-default": null,
    "simple/no-tools/t-0.1/r-none": null,
    "simple/no-tools/t-0.1/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-low": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-medium": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-high": null,
    "simple/no-tools/t-0.1/r-xhigh": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-maximal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-default": null,
    "simple/no-tools/t-1/r-none": null,
    "simple/no-tools/t-1/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-low": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-medium": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-high": null,
    "simple/no-tools/t-1/r-xhigh": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-maximal": [INPUT_CONFIGURATION_ERROR],
    "calc/calc/t-default/r-medium": [INPUT_CONFIGURATION_ERROR],
    "calc/calc/t-0.1/r-default": null,
    "calc/calc/t-0.1/r-medium": [INPUT_CONFIGURATION_ERROR],
    "calc/calc/t-default/r-default/force-tool-default": null,
    "calc/calc/t-default/r-default/force-tool": null,
    "calc/calc/t-default/r-high/force-tool": null,
    "calc/calc/t-default/r-none/force-tool": null,
    "reasoning/no-tools/t-default/r-none": null,
    "reasoning/no-tools/t-default/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "reasoning/no-tools/t-default/r-low": [INPUT_CONFIGURATION_ERROR],
    "output-format/json-schema/t-default/r-none": null,
    "output-format/json-schema/t-default/r-high": null,
    "following/no-tools/t-default/r-default": null,
    "cache/no-tools/t-default/r-default": null,
  },
};

// NODE_ENV=test RUN_LLM_TEST=true npm run test -- --config lib/model_constructors/test/vite.config.js --bail 1 lib/model_constructors/test/endpoints/moonshot_ai_kimi_k2_dot_six_global_fireworks.test.ts
runStreamEndpointTests(
  MoonshotAiKimiK2Dot6GlobalFireworksStream,
  MoonshotAiKimiK2Dot6GlobalFireworksStreamSetup
);
