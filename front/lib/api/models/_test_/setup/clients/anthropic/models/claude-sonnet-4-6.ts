import type { Setup } from "@app/lib/api/models/_test_/setup/types";
import { WithStreamDebug } from "@app/lib/api/models/_test_/setup/utils";
import { INPUT_CONFIGURATION_ERROR } from "@app/lib/api/models/_test_/types";
import { AnthropicClaudeSonnetFourDotSix } from "@app/lib/api/models/clients/anthropic/models/anthropic-claude-sonnet-4-6";

export const anthropicClaudeSonnetFourDotSixSetup: Setup = {
  createInstance: () =>
    new (WithStreamDebug(AnthropicClaudeSonnetFourDotSix))({
      ANTHROPIC_API_KEY: process.env.DUST_MANAGED_ANTHROPIC_API_KEY ?? "",
    }),
  shouldRun: false,
  tests: {
    // Minimal reasoning effort is not supported by the model
    "simple/no-tools/t-default/r-minimal": {
      shouldRun: false,
      checkers: [INPUT_CONFIGURATION_ERROR],
    },
    "simple/no-tools/t-0/r-minimal": {
      shouldRun: false,
      checkers: [INPUT_CONFIGURATION_ERROR],
    },
    "simple/no-tools/t-1/r-minimal": {
      shouldRun: false,
      checkers: [INPUT_CONFIGURATION_ERROR],
    },
    "simple/no-tools/t-0.1/r-minimal": {
      shouldRun: false,
      checkers: [INPUT_CONFIGURATION_ERROR],
    },

    // In thinking mode, temperature <> 1 is not supported
    "simple/no-tools/t-0/r-default": {
      shouldRun: false,
      checkers: [INPUT_CONFIGURATION_ERROR],
    },
    "simple/no-tools/t-0/r-low": {
      shouldRun: false,
      checkers: [INPUT_CONFIGURATION_ERROR],
    },
    "simple/no-tools/t-0/r-medium": {
      shouldRun: false,
      checkers: [INPUT_CONFIGURATION_ERROR],
    },
    "simple/no-tools/t-0/r-high": {
      shouldRun: false,
      checkers: [INPUT_CONFIGURATION_ERROR],
    },
    "simple/no-tools/t-0/r-maximal": {
      shouldRun: false,
      checkers: [INPUT_CONFIGURATION_ERROR],
    },
    "simple/no-tools/t-0.1/r-default": {
      shouldRun: false,
      checkers: [INPUT_CONFIGURATION_ERROR],
    },
    "simple/no-tools/t-0.1/r-low": {
      shouldRun: false,
      checkers: [INPUT_CONFIGURATION_ERROR],
    },
    "simple/no-tools/t-0.1/r-medium": {
      shouldRun: false,
      checkers: [INPUT_CONFIGURATION_ERROR],
    },
    "simple/no-tools/t-0.1/r-high": {
      shouldRun: false,
      checkers: [INPUT_CONFIGURATION_ERROR],
    },
    "simple/no-tools/t-0.1/r-maximal": {
      shouldRun: false,
      checkers: [INPUT_CONFIGURATION_ERROR],
    },
    "calc/calc/t-0.1/r-default": {
      shouldRun: false,
      checkers: [INPUT_CONFIGURATION_ERROR],
    },
    "calc/calc/t-0.1/r-medium": {
      shouldRun: false,
      checkers: [INPUT_CONFIGURATION_ERROR],
    },

    "simple/no-tools/t-default/r-default": { shouldRun: false },
    "simple/no-tools/t-default/r-none": { shouldRun: false },
    "simple/no-tools/t-default/r-low": { shouldRun: false },
    "simple/no-tools/t-default/r-medium": { shouldRun: false },
    "simple/no-tools/t-default/r-high": { shouldRun: false },
    "simple/no-tools/t-default/r-maximal": { shouldRun: false },
    "simple/no-tools/t-0/r-none": { shouldRun: false },
    "simple/no-tools/t-0.1/r-none": { shouldRun: false },
    "simple/no-tools/t-1/r-default": { shouldRun: false },
    "simple/no-tools/t-1/r-none": { shouldRun: false },
    "simple/no-tools/t-1/r-low": { shouldRun: false },
    "simple/no-tools/t-1/r-medium": { shouldRun: false },
    "simple/no-tools/t-1/r-high": { shouldRun: false, debug: true },
    "simple/no-tools/t-1/r-maximal": { shouldRun: false },
    "calc/calc/t-default/r-medium": { shouldRun: false },
    "calc/calc/t-default/r-none/force-tool-default": {
      shouldRun: false,
      debug: true,
    },
    "calc/calc/t-default/r-none/force-tool": { shouldRun: false },
    "reasoning/no-tools/t-default/r-none": { shouldRun: false },
    "reasoning/no-tools/t-default/r-low": { shouldRun: true },

    // Output format
    "output-format/json-schema/t-default/r-none": {
      shouldRun: true,
      debug: false,
    },
    "output-format/json-schema/t-default/r-high": {
      shouldRun: true,
      debug: true,
    },
    "following/no-tools/t-default/r-default": {
      shouldRun: true,
      debug: true,
    },
  },
};
