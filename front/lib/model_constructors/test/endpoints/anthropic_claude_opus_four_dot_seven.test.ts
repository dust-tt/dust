// @vitest-environment node

import { AnthropicGlobalClaudeOpusFourDotSevenStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_opus_four_dot_seven";
import {
  INPUT_CONFIGURATION_ERROR,
  SUCCESS,
} from "@app/lib/model_constructors/test/cases";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

const setup: StreamSetup = {
  createInstance: () =>
    new AnthropicGlobalClaudeOpusFourDotSevenStream({
      ANTHROPIC_API_KEY: process.env.DUST_MANAGED_ANTHROPIC_API_KEY ?? "",
    }),
  // `null` runs the case with its default checkers; a checker array overrides
  // them. Every case always runs.
  tests: {
    // Minimal reasoning effort is not supported by the model.
    "simple/no-tools/t-default/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-0.1/r-minimal": [INPUT_CONFIGURATION_ERROR],
    "simple/no-tools/t-1/r-minimal": [INPUT_CONFIGURATION_ERROR],
    // When forcing tool use, reasoning must be set to none.
    "calc/calc/t-default/r-default/force-tool": [INPUT_CONFIGURATION_ERROR],

    "simple/no-tools/t-default/r-default": null,
    "simple/no-tools/t-default/r-none": null,
    "simple/no-tools/t-default/r-low": null,
    "simple/no-tools/t-default/r-medium": null,
    "simple/no-tools/t-default/r-high": null,
    "simple/no-tools/t-default/r-maximal": null,
    "simple/no-tools/t-0/r-default": null,
    "simple/no-tools/t-0/r-none": null,
    "simple/no-tools/t-0/r-low": null,
    "simple/no-tools/t-0/r-medium": null,
    "simple/no-tools/t-0/r-high": null,
    "simple/no-tools/t-0/r-maximal": null,
    "simple/no-tools/t-0.1/r-default": null,
    "simple/no-tools/t-0.1/r-none": null,
    "simple/no-tools/t-0.1/r-low": null,
    "simple/no-tools/t-0.1/r-medium": null,
    "simple/no-tools/t-0.1/r-high": null,
    "simple/no-tools/t-0.1/r-maximal": null,
    "simple/no-tools/t-1/r-default": null,
    "simple/no-tools/t-1/r-none": null,
    "simple/no-tools/t-1/r-low": null,
    "simple/no-tools/t-1/r-medium": null,
    "simple/no-tools/t-1/r-high": null,
    "simple/no-tools/t-1/r-maximal": null,

    "calc/calc/t-default/r-medium": null,
    "calc/calc/t-0.1/r-default": null,
    "calc/calc/t-0.1/r-medium": null,

    "calc/calc/t-default/r-default/force-tool-default": null,
    "calc/calc/t-default/r-none/force-tool": null,

    "reasoning/no-tools/t-default/r-none": null,
    // Opus 4.7's adaptive thinking declines to reason at `low` effort on this
    // prompt, so we only assert the stream completes.
    "reasoning/no-tools/t-default/r-low": [SUCCESS],

    "output-format/json-schema/t-default/r-none": null,
    "output-format/json-schema/t-default/r-high": null,

    "following/no-tools/t-default/r-default": null,

    "cache/no-tools/t-default/r-default": null,
  },
};

// NODE_ENV=test RUN_LLM_TEST=true npm run test -- --config lib/model_constructors/test/vite.config.js --bail 1 lib/model_constructors/test/endpoints/anthropic_claude_opus_four_dot_seven.test.ts
runStreamEndpointTests(AnthropicGlobalClaudeOpusFourDotSevenStream, setup);
