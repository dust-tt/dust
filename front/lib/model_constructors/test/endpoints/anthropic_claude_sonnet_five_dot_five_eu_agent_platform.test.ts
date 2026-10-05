// @vitest-environment node

import { AnthropicClaudeSonnetFiveDotFiveEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_sonnet_five_dot_five_eu_agent_platform";
import {
  INPUT_CONFIGURATION_ERROR,
  SUCCESS,
} from "@app/lib/model_constructors/test/cases";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

export const AnthropicClaudeSonnetFiveDotFiveEuropeAgentPlatformStreamSetup: StreamSetup =
  {
    createInstance: () =>
      new AnthropicClaudeSonnetFiveDotFiveEuropeAgentPlatformStream({
        AGENT_PLATFORM_PROJECT_ID: process.env.VERTEX_AI_PROJECT_ID ?? "",
      }),
    // `null` runs the case with its default checkers; a checker array overrides
    // them. Rejections (effort "none"/"minimal", `temperature` other than 1,
    // forced tool) are documented on the config mixin; `eu/agent-platform`
    // returned exactly the same ones as `global/anthropic` (2026-09-28).
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
      // Adaptive thinking skips thinking on this prompt at `low` (no thinking
      // block at all, measured 2026-09-28), so assert success only.
      "reasoning/no-tools/t-default/r-low": [SUCCESS],
      "output-format/json-schema/t-default/r-none": [INPUT_CONFIGURATION_ERROR],
      "output-format/json-schema/t-default/r-high": null,
      "following/no-tools/t-default/r-default": null,
      "cache/no-tools/t-default/r-default": null,
    },
  };

// NODE_ENV=test RUN_LLM_TEST=true npm run test -- --config lib/model_constructors/test/vite.config.js --bail 1 lib/model_constructors/test/endpoints/anthropic_claude_sonnet_five_dot_five_eu_agent_platform.test.ts
runStreamEndpointTests(
  AnthropicClaudeSonnetFiveDotFiveEuropeAgentPlatformStream,
  AnthropicClaudeSonnetFiveDotFiveEuropeAgentPlatformStreamSetup
);
