import {
  INPUT_CONFIGURATION_ERROR,
  SUCCESS,
} from "@app/lib/model_constructors/test/cases";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

// Verified against the live AI Studio and global and EU Agent Platform APIs on
// 2026-10-13 with the widest input schema. Low, medium, and high thinking work.
// Minimal returns INVALID_ARGUMENT. Thinking-off is rejected by Agent Platform
// and accepted by AI Studio, but undocumented, so the product does not expose it. Temperatures from 0 to 1 are accepted but
// ignored by the API; the Dust layer strips them.
export const GEMINI_4_ARGON_TESTS = {
  "simple/no-tools/t-default/r-default": null,
  "simple/no-tools/t-default/r-none": [INPUT_CONFIGURATION_ERROR],
  "simple/no-tools/t-default/r-minimal": [INPUT_CONFIGURATION_ERROR],
  "simple/no-tools/t-default/r-low": null,
  "simple/no-tools/t-default/r-medium": null,
  "simple/no-tools/t-default/r-high": null,
  "simple/no-tools/t-default/r-xhigh": [INPUT_CONFIGURATION_ERROR],
  "simple/no-tools/t-default/r-maximal": [INPUT_CONFIGURATION_ERROR],
  "simple/no-tools/t-0/r-default": null,
  "simple/no-tools/t-0/r-none": [INPUT_CONFIGURATION_ERROR],
  "simple/no-tools/t-0/r-minimal": [INPUT_CONFIGURATION_ERROR],
  "simple/no-tools/t-0/r-low": null,
  "simple/no-tools/t-0/r-medium": null,
  "simple/no-tools/t-0/r-high": null,
  "simple/no-tools/t-0/r-xhigh": [INPUT_CONFIGURATION_ERROR],
  "simple/no-tools/t-0/r-maximal": [INPUT_CONFIGURATION_ERROR],
  "simple/no-tools/t-0.1/r-default": null,
  "simple/no-tools/t-0.1/r-none": [INPUT_CONFIGURATION_ERROR],
  "simple/no-tools/t-0.1/r-minimal": [INPUT_CONFIGURATION_ERROR],
  "simple/no-tools/t-0.1/r-low": null,
  "simple/no-tools/t-0.1/r-medium": null,
  "simple/no-tools/t-0.1/r-high": null,
  "simple/no-tools/t-0.1/r-xhigh": [INPUT_CONFIGURATION_ERROR],
  "simple/no-tools/t-0.1/r-maximal": [INPUT_CONFIGURATION_ERROR],
  "simple/no-tools/t-1/r-default": null,
  "simple/no-tools/t-1/r-none": [INPUT_CONFIGURATION_ERROR],
  "simple/no-tools/t-1/r-minimal": [INPUT_CONFIGURATION_ERROR],
  "simple/no-tools/t-1/r-low": null,
  "simple/no-tools/t-1/r-medium": null,
  "simple/no-tools/t-1/r-high": null,
  "simple/no-tools/t-1/r-xhigh": [INPUT_CONFIGURATION_ERROR],
  "simple/no-tools/t-1/r-maximal": [INPUT_CONFIGURATION_ERROR],
  "calc/calc/t-default/r-medium": null,
  "calc/calc/t-0.1/r-default": null,
  "calc/calc/t-0.1/r-medium": null,
  "calc/calc/t-default/r-default/force-tool-default": null,
  "calc/calc/t-default/r-default/force-tool": null,
  "calc/calc/t-default/r-high/force-tool": null,
  "calc/calc/t-default/r-none/force-tool": [INPUT_CONFIGURATION_ERROR],
  "reasoning/no-tools/t-default/r-none": [INPUT_CONFIGURATION_ERROR],
  "reasoning/no-tools/t-default/r-minimal": [INPUT_CONFIGURATION_ERROR],
  // Low effort can complete without emitting thought tokens, so assert the API
  // contract (successful request) rather than a nondeterministic model choice.
  "reasoning/no-tools/t-default/r-low": [SUCCESS],
  "output-format/json-schema/t-default/r-none": [INPUT_CONFIGURATION_ERROR],
  "output-format/json-schema/t-default/r-high": null,
  "following/no-tools/t-default/r-default": null,
  "cache/no-tools/t-default/r-default": null,
} satisfies StreamSetup["tests"];
