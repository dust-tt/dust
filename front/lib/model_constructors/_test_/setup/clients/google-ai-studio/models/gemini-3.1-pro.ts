import type { Setup } from "@app/lib/model_constructors/_test_/setup/types";
import { WithStreamDebug } from "@app/lib/model_constructors/_test_/setup/utils";
import { INPUT_CONFIGURATION_ERROR } from "@app/lib/model_constructors/_test_/types";
import { GeminiThreeDotOnePro } from "@app/lib/model_constructors/clients/google-ai-studio/models/gemini-3.1-pro";

export const geminiThreeDotOneProSetup: Setup = {
  createInstance: () =>
    new (WithStreamDebug(GeminiThreeDotOnePro))({
      GOOGLE_AI_STUDIO_API_KEY:
        process.env.DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY ?? "",
    }),
  shouldRun: false,
  tests: {
    // Gemini 3+ models do not support "minimal" reasoning effort.
    "simple/no-tools/t-default/r-minimal": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
      debug: true,
    },
    "simple/no-tools/t-0/r-minimal": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
      debug: false,
    },
    "simple/no-tools/t-0.1/r-minimal": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
      debug: false,
    },
    "simple/no-tools/t-1/r-minimal": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
      debug: false,
    },

    // Gemini 3+ models do not support "maximal" reasoning effort.
    "simple/no-tools/t-default/r-maximal": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
      debug: false,
    },
    "simple/no-tools/t-0/r-maximal": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
      debug: false,
    },
    "simple/no-tools/t-0.1/r-maximal": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
      debug: false,
    },
    "simple/no-tools/t-1/r-maximal": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
      debug: false,
    },

    // Gemini 3+ models do not support "none" reasoning effort.
    "simple/no-tools/t-default/r-none": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
      debug: false,
    },
    "simple/no-tools/t-1/r-none": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: false,
      debug: false,
    },

    "calc/calc/t-default/r-none/force-tool": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: true,
      debug: false,
    },
    "output-format/json-schema/t-default/r-none": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: true,
      debug: false,
    },
    "reasoning/no-tools/t-default/r-none": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: true,
      debug: false,
    },

    // Enforces reasoning
    "simple/no-tools/t-0/r-none": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: true,
      debug: false,
    },
    "simple/no-tools/t-0.1/r-none": {
      checkers: [INPUT_CONFIGURATION_ERROR],
      shouldRun: true,
      debug: false,
    },

    // We lock temperature to 1 (Google's strong recommendation for Gemini 3);
    // any other value is rejected at config validation.
    "simple/no-tools/t-0/r-default": {
      shouldRun: true,
      debug: false,
    },
    "simple/no-tools/t-0/r-low": {
      shouldRun: true,
      debug: false,
    },
    "simple/no-tools/t-0/r-medium": {
      shouldRun: true,
      debug: false,
    },
    "simple/no-tools/t-0/r-high": {
      shouldRun: true,
      debug: false,
    },
    "simple/no-tools/t-0.1/r-default": {
      shouldRun: true,
      debug: false,
    },
    "simple/no-tools/t-0.1/r-low": {
      shouldRun: true,
      debug: false,
    },
    "simple/no-tools/t-0.1/r-medium": {
      shouldRun: true,
      debug: false,
    },
    "simple/no-tools/t-0.1/r-high": {
      shouldRun: true,
      debug: false,
    },
    "calc/calc/t-0.1/r-default": {
      shouldRun: true,
      debug: false,
    },
    "calc/calc/t-0.1/r-medium": {
      shouldRun: true,
      debug: false,
    },

    // Valid combinations: temperature defaults to 1, reasoning in {none, low,
    // medium, high}. Default off in CI so we don't burn API tokens; flip
    // `shouldRun: true` locally to exercise the live API.
    "simple/no-tools/t-default/r-default": { shouldRun: true, debug: false },
    "simple/no-tools/t-default/r-low": { shouldRun: true, debug: false },
    "simple/no-tools/t-default/r-medium": { shouldRun: true, debug: false },
    "simple/no-tools/t-default/r-high": { shouldRun: true, debug: false },
    "simple/no-tools/t-1/r-default": { shouldRun: true, debug: false },
    "simple/no-tools/t-1/r-low": { shouldRun: true, debug: false },
    "simple/no-tools/t-1/r-medium": { shouldRun: true, debug: false },
    "simple/no-tools/t-1/r-high": { shouldRun: true, debug: false },

    "calc/calc/t-default/r-default/force-tool-default": {
      shouldRun: true,
    },
    "calc/calc/t-default/r-default/force-tool": {
      shouldRun: true,
      debug: false,
    },
    "calc/calc/t-default/r-medium": { shouldRun: true, debug: false },

    "reasoning/no-tools/t-default/r-low": { shouldRun: true, debug: false },

    // Output format
    "output-format/json-schema/t-default/r-high": {
      shouldRun: true,
      debug: false,
    },

    "following/no-tools/t-default/r-default": { shouldRun: true, debug: false },
  },
};
