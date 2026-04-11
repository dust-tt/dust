import { Setup } from "@/_test_/setup/types";
import { WithStreamDebug } from "@/_test_/setup/utils";
import { INPUT_CONFIGURATION_ERROR } from "@/_test_/types";
import { OpenAiGptFiveDotFour } from "@/clients/openai-responses/models/gpt-5-4";

export const openaiGptFiveDotFourSetup: Setup = {
  instance: new (WithStreamDebug(OpenAiGptFiveDotFour))({
    apiKey: process.env.DUST_MANAGED_OPENAI_API_KEY as string,
  }),
  shouldRun: false,
  tests: {
    // Does not support minimal reasoning effort
    "simple/no-tools/t-default/r-minimal": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
    },
    "simple/no-tools/t-0/r-minimal": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
    },
    "simple/no-tools/t-0.1/r-minimal": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
    },
    "simple/no-tools/t-1/r-minimal": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
    },

    // Can not set temperature <> 1 with reasoning effort different than "none"
    "simple/no-tools/t-0/r-low": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
    },
    "simple/no-tools/t-0/r-medium": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
    },
    "simple/no-tools/t-0/r-high": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
    },
    "simple/no-tools/t-0/r-maximal": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
    },
    "simple/no-tools/t-0.1/r-low": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
    },
    "simple/no-tools/t-0.1/r-medium": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
    },
    "simple/no-tools/t-0.1/r-high": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
    },
    "simple/no-tools/t-0.1/r-maximal": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
    },
    "calc/calc/t-0.1/r-medium": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
    },

    // Run normally
    "simple/no-tools/t-default/r-default": { shouldRun: false },
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

    "calc/calc/t-default/r-none/force-tool-default": {
      shouldRun: false,
    },
    "calc/calc/t-default/r-none/force-tool": {
      shouldRun: false,
    },

    "reasoning/no-tools/t-default/r-none": { shouldRun: false },
    "reasoning/no-tools/t-default/r-low": { shouldRun: false },
  },
};
