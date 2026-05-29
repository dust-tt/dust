import type { Setup } from "@app/lib/model_constructors/_test_/setup/types";
import { WithStreamDebug } from "@app/lib/model_constructors/_test_/setup/utils";
import { INPUT_CONFIGURATION_ERROR } from "@app/lib/model_constructors/_test_/types";
import { AnthropicClaudeSonnetFourDotSix } from "@app/lib/model_constructors/clients/anthropic/models/anthropic-claude-sonnet-4-6";

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
    // When forcing tool use, reasoning must be set to none
    "calc/calc/t-default/r-default/force-tool": {
      shouldRun: true,
      debug: false,
      checkers: [INPUT_CONFIGURATION_ERROR],
    },

    // In thinking mode, temperature <> 1 is overwritten
    "simple/no-tools/t-0/r-default": {
      shouldRun: false,
    },
    "simple/no-tools/t-0/r-low": {
      shouldRun: false,
    },
    "simple/no-tools/t-0/r-medium": {
      shouldRun: false,
    },
    "simple/no-tools/t-0/r-high": {
      shouldRun: false,
    },
    "simple/no-tools/t-0/r-maximal": {
      shouldRun: false,
    },
    "simple/no-tools/t-0.1/r-default": {
      shouldRun: false,
    },
    "simple/no-tools/t-0.1/r-low": {
      shouldRun: false,
    },
    "simple/no-tools/t-0.1/r-medium": {
      shouldRun: false,
    },
    "simple/no-tools/t-0.1/r-high": {
      shouldRun: false,
    },
    "simple/no-tools/t-0.1/r-maximal": {
      shouldRun: false,
      debug: false,
    },
    "calc/calc/t-0.1/r-default": {
      shouldRun: true,
    },
    "calc/calc/t-0.1/r-medium": {
      shouldRun: true,
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
    "simple/no-tools/t-1/r-high": { shouldRun: false, debug: false },
    "simple/no-tools/t-1/r-maximal": { shouldRun: false },
    "calc/calc/t-default/r-medium": { shouldRun: true },

    "calc/calc/t-default/r-default/force-tool-default": { shouldRun: true },
    "calc/calc/t-default/r-none/force-tool": { shouldRun: true },
    "reasoning/no-tools/t-default/r-none": { shouldRun: true },
    "reasoning/no-tools/t-default/r-low": { shouldRun: true },

    // Output format
    "output-format/json-schema/t-default/r-none": {
      shouldRun: true,
      debug: true,
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
