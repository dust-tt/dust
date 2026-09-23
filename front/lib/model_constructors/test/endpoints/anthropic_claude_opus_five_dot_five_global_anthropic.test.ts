// @vitest-environment node

import { AnthropicClaudeOpusFiveDotFiveGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_five_dot_five_global_anthropic";
import { INPUT_CONFIGURATION_ERROR } from "@app/lib/model_constructors/test/cases";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

export const AnthropicClaudeOpusFiveDotFiveGlobalAnthropicStreamSetup: StreamSetup =
  {
    createInstance: () =>
      new AnthropicClaudeOpusFiveDotFiveGlobalAnthropicStream({
        ANTHROPIC_API_KEY: process.env.DUST_MANAGED_ANTHROPIC_API_KEY ?? "",
      }),
    // `null` runs the case with its default checkers; a checker array overrides
    // them. Every case always runs.
    //
    // Follows Anthropic's documented contract for Opus 5.5 (2026-09-22,
    // https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5),
    // which enumerates what carries over from Opus 5 and what changed. Each
    // rejection below was also confirmed against the live API (2026-09-22) —
    // the schema short-circuits those cases, so they were probed directly.
    //
    // Three families of case never reach the API, because `configSchema`
    // rejects them and `runStream` short-circuits with an
    // `input_configuration_error`:
    //
    //   - Any `temperature` other than `1`. Unchanged from Opus 5: sampling
    //     params were removed on Opus 4.7+, so `t-0` / `t-0.1` are
    //     configuration errors at every effort, while `t-1` reaches the API.
    //   - Effort "none" or "minimal". This is the first break from Opus 5:
    //     "none" would build `thinking: {type: "disabled"}`, which Opus 5.5
    //     answers with a 400 *at every effort level* — Opus 5 accepted it at
    //     `high` and below. "minimal" has no Anthropic equivalent and
    //     `assertNever`s in the converter.
    //   - A forced `tool_choice`. The second break from Opus 5: `tool_choice`
    //     of type "any" or "tool" returns a 400 on Opus 5.5, so `forceTool` is
    //     pinned to `undefined` in the schema. `force-tool-default` (no forced
    //     choice) still reaches the API.
    //
    // `r-default` and `r-medium` build the same request here (the schema
    // defaults reasoning to `medium`, Anthropic's own default for this model);
    // both are kept so the effort is legible in the key.
    tests: {
      "simple/no-tools/t-default/r-default": null,
      "simple/no-tools/t-default/r-none": [INPUT_CONFIGURATION_ERROR],
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
      "simple/no-tools/t-1/r-none": [INPUT_CONFIGURATION_ERROR],
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
      "calc/calc/t-default/r-default/force-tool": [INPUT_CONFIGURATION_ERROR],
      "calc/calc/t-default/r-high/force-tool": [INPUT_CONFIGURATION_ERROR],
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

// NODE_ENV=test RUN_LLM_TEST=true npm run test -- --config lib/model_constructors/test/vite.config.js --bail 1 lib/model_constructors/test/endpoints/anthropic_claude_opus_five_dot_five_global_anthropic.test.ts
runStreamEndpointTests(
  AnthropicClaudeOpusFiveDotFiveGlobalAnthropicStream,
  AnthropicClaudeOpusFiveDotFiveGlobalAnthropicStreamSetup
);
