// @vitest-environment node

import { ZAiGlmFiveDotThreeGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/z_ai_glm_five_dot_three_global_fireworks";
import { INPUT_CONFIGURATION_ERROR } from "@app/lib/model_constructors/test/cases";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

// UNVERIFIED EXPECTATIONS - DO NOT MERGE BEFORE A LIVE RUN.
//
// These expectations were narrowed from Z.ai's documented GLM-5.3 contract
// (always-on thinking, low/high/max efforts, max default, automatic tool choice
// only) and from the sibling GLM-5.3-Flash endpoint characterized live on
// 2026-08-31. They have not been exercised against the live Fireworks
// deployment, because no DUST_MANAGED_FIREWORKS_API_KEY was available in the
// authoring environment.
//
// Run the command at the bottom of this file and reconcile every case before
// merging. Expect churn in at least these places:
//   - the gateway may accept undocumented medium/xhigh efforts;
//   - named tool forcing is withheld on documentation grounds only;
//   - individual prompts may need [SUCCESS] tolerances for wording drift, the
//     way GLM-5.3-Flash needs one on "simple/no-tools/t-default/r-low".
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
    "simple/no-tools/t-0/r-low": null,
    "simple/no-tools/t-0/r-high": null,
    "simple/no-tools/t-0/r-maximal": null,
    "simple/no-tools/t-0.1/r-default": null,
    "simple/no-tools/t-1/r-default": null,
    "calc/calc/t-default/r-medium": [INPUT_CONFIGURATION_ERROR],
    "calc/calc/t-0.1/r-default": null,
    "calc/calc/t-default/r-default/force-tool-default": null,
    "calc/calc/t-default/r-default/force-tool": [INPUT_CONFIGURATION_ERROR],
    "calc/calc/t-default/r-high/force-tool": [INPUT_CONFIGURATION_ERROR],
    "calc/calc/t-default/r-none/force-tool": [INPUT_CONFIGURATION_ERROR],
    "reasoning/no-tools/t-default/r-none": [INPUT_CONFIGURATION_ERROR],
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
