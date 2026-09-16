// @vitest-environment node

import { OpenAIGptFiveDotSixSolGlobalBedrockStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_sol_global_bedrock";
import { INPUT_CONFIGURATION_ERROR } from "@app/lib/model_constructors/test/cases";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

export const OpenAIGptFiveDotSixSolGlobalBedrockStreamSetup: StreamSetup = {
  createInstance: () =>
    new OpenAIGptFiveDotSixSolGlobalBedrockStream({
      AWS_BEARER_TOKEN_BEDROCK: process.env.AWS_BEARER_TOKEN_BEDROCK ?? "",
    }),
  // UNVERIFIED: not yet run against Bedrock. The expectations are inherited
  // from the OpenAI-direct Sol endpoint, which shares the same `configSchema`,
  // so the `INPUT_CONFIGURATION_ERROR` markers are the ones our own zod
  // produces and are host-independent. What is *not* verified is whether
  // Bedrock accepts everything the OpenAI Responses API does. Known
  // divergences to characterize before this ships:
  //
  //   - Structured outputs are documented as unsupported on `bedrock-runtime`,
  //     so the two `output-format/json-schema` cases may come back as provider
  //     errors. If they do, the fix is a host-level narrowing of
  //     `outputFormat`, not a marker here.
  //   - Server-side tool use is unsupported on `bedrock-runtime` (Dust sends
  //     only client-side tools, so this suite should not notice).
  //   - Only the Standard service tier exists, hence no flex on the endpoint.
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

// NODE_ENV=test RUN_LLM_TEST=true AWS_BEARER_TOKEN_BEDROCK=... npm run test -- --config lib/model_constructors/test/vite.config.js --bail 1 lib/model_constructors/test/endpoints/openai_gpt_five_dot_six_sol_global_bedrock.test.ts
runStreamEndpointTests(
  OpenAIGptFiveDotSixSolGlobalBedrockStream,
  OpenAIGptFiveDotSixSolGlobalBedrockStreamSetup
);
