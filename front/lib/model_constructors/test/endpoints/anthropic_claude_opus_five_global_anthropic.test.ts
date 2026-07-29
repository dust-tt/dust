// @vitest-environment node

import { AnthropicClaudeOpusFiveGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_five_global_anthropic";
import { INPUT_CONFIGURATION_ERROR } from "@app/lib/model_constructors/test/cases";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

export const AnthropicClaudeOpusFiveGlobalAnthropicStreamSetup: StreamSetup = {
  createInstance: () =>
    new AnthropicClaudeOpusFiveGlobalAnthropicStream({
      ANTHROPIC_API_KEY: process.env.DUST_MANAGED_ANTHROPIC_API_KEY ?? "",
    }),
  // `null` runs the case with its default checkers; a checker array overrides
  // them. Every case always runs.
  //
  // Verified against the live API (2026-07-27) by running this suite with the
  // widest `inputConfigSchema`. Two families of case never reach the API,
  // because `configSchema` rejects them and `runStream` short-circuits with an
  // `input_configuration_error`:
  //
  //   - Any `temperature` other than `1`. Sampling params were removed on Opus
  //     4.7+, and unlike Haiku 4.5 that holds whatever the thinking mode is:
  //     with thinking off the API answers "`temperature` is deprecated for this
  //     model", with thinking on "`temperature` may only be set to 1 when
  //     thinking is enabled or in adaptive mode". So `t-0` / `t-0.1` are
  //     configuration errors at every effort, while `t-1` reaches the API.
  //   - Effort "minimal" — no Anthropic equivalent, `assertNever`s in the
  //     converter.
  //
  // Forcing a tool needs no special handling: Opus 5 accepts a forced
  // `tool_choice` with adaptive thinking on, so `force-tool` runs against the
  // API and succeeds at any effort. `r-default` and `r-high` build the same
  // request (the schema defaults reasoning to `high`); both are kept so the
  // effort is legible in the key.
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

// NODE_ENV=test RUN_LLM_TEST=true npm run test -- --config lib/model_constructors/test/vite.config.js --bail 1 lib/model_constructors/test/endpoints/anthropic_claude_opus_five_global_anthropic.test.ts
runStreamEndpointTests(
  AnthropicClaudeOpusFiveGlobalAnthropicStream,
  AnthropicClaudeOpusFiveGlobalAnthropicStreamSetup
);
