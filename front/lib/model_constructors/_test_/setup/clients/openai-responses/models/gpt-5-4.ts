import type { Setup } from "@app/lib/model_constructors/_test_/setup/types";
import { WithStreamDebug } from "@app/lib/model_constructors/_test_/setup/utils";
import { INPUT_CONFIGURATION_ERROR } from "@app/lib/model_constructors/_test_/types";
import { OpenAiGptFiveDotFour } from "@app/lib/model_constructors/clients/openai-responses/models/openai-gpt-5-4";

export const openaiGptFiveDotFourSetup: Setup = {
  createInstance: () =>
    new (WithStreamDebug(OpenAiGptFiveDotFour))({
      OPENAI_API_KEY: process.env.DUST_MANAGED_OPENAI_API_KEY ?? "",
    }),
  shouldRun: false,
  tests: {
    // Does not support minimal reasoning effort
    "simple/no-tools/t-default/r-minimal": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: true,
    },
    "simple/no-tools/t-0/r-minimal": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: true,
    },
    "simple/no-tools/t-0.1/r-minimal": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: true,
    },
    "simple/no-tools/t-1/r-minimal": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: true,
    },

    // Temperature overwritten to 1 when reasoning is not none
    "simple/no-tools/t-0/r-low": {
      shouldRun: true,
    },
    "simple/no-tools/t-0/r-medium": {
      shouldRun: true,
    },
    "simple/no-tools/t-0/r-high": {
      shouldRun: true,
    },
    "simple/no-tools/t-0/r-maximal": {
      shouldRun: true,
    },
    "simple/no-tools/t-0.1/r-low": {
      shouldRun: true,
    },
    "simple/no-tools/t-0.1/r-medium": {
      shouldRun: true,
    },
    "simple/no-tools/t-0.1/r-high": {
      shouldRun: true,
    },
    "simple/no-tools/t-0.1/r-maximal": {
      shouldRun: true,
    },
    "calc/calc/t-0.1/r-medium": {
      shouldRun: true,
    },

    // Run normally
    "simple/no-tools/t-default/r-default": { shouldRun: true, debug: false },
    "simple/no-tools/t-default/r-none": { shouldRun: false },
    "simple/no-tools/t-default/r-low": { shouldRun: false },
    "simple/no-tools/t-default/r-medium": { shouldRun: false },
    "simple/no-tools/t-default/r-high": { shouldRun: false },
    "simple/no-tools/t-default/r-maximal": { shouldRun: false },
    "simple/no-tools/t-0/r-default": { shouldRun: false },
    "simple/no-tools/t-0/r-none": { shouldRun: false },
    "simple/no-tools/t-0.1/r-default": { shouldRun: false },
    "simple/no-tools/t-0.1/r-none": { shouldRun: false },
    "simple/no-tools/t-1/r-default": { shouldRun: false },
    "simple/no-tools/t-1/r-none": { shouldRun: false },
    "simple/no-tools/t-1/r-low": { shouldRun: false },
    "simple/no-tools/t-1/r-medium": { shouldRun: false },
    "simple/no-tools/t-1/r-high": { shouldRun: false },
    "simple/no-tools/t-1/r-maximal": { shouldRun: false },

    "calc/calc/t-0.1/r-default": { shouldRun: false },
    "calc/calc/t-default/r-medium": { shouldRun: false },

    "calc/calc/t-default/r-default/force-tool-default": {
      shouldRun: true,
    },
    "calc/calc/t-default/r-default/force-tool": {
      shouldRun: true,
    },
    "calc/calc/t-default/r-none/force-tool": {
      shouldRun: true,
    },

    "reasoning/no-tools/t-default/r-none": { shouldRun: false },
    "reasoning/no-tools/t-default/r-low": { shouldRun: false },

    // Output format
    "output-format/json-schema/t-default/r-none": { shouldRun: false },
    "output-format/json-schema/t-default/r-high": { shouldRun: false },
    "following/no-tools/t-default/r-default": {
      shouldRun: true,
      debug: true,
    },
  },
};
