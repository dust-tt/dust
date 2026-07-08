// @vitest-environment node

import { NoopGlobalNoopStream } from "@app/lib/model_constructors/stream/endpoints/noop_global_noop";
import { SUCCESS } from "@app/lib/model_constructors/test/cases";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

// The noop endpoint has no external provider API: it synthesizes a canned
// response and ignores every config knob (temperature, reasoning, tools,
// output format). The shared semantic checkers (contains "hi", tool call,
// reasoning, JSON schema) therefore don't apply — the meaningful invariant is
// that every input configuration streams to a successful completion, so every
// case overrides the default checkers with SUCCESS.
export const NoopGlobalNoopStreamSetup: StreamSetup = {
  createInstance: () => new NoopGlobalNoopStream({}),
  tests: {
    "simple/no-tools/t-default/r-default": [SUCCESS],
    "simple/no-tools/t-default/r-none": [SUCCESS],
    "simple/no-tools/t-default/r-minimal": [SUCCESS],
    "simple/no-tools/t-default/r-low": [SUCCESS],
    "simple/no-tools/t-default/r-medium": [SUCCESS],
    "simple/no-tools/t-default/r-high": [SUCCESS],
    "simple/no-tools/t-default/r-maximal": [SUCCESS],
    "simple/no-tools/t-0/r-default": [SUCCESS],
    "simple/no-tools/t-0/r-none": [SUCCESS],
    "simple/no-tools/t-0/r-minimal": [SUCCESS],
    "simple/no-tools/t-0/r-low": [SUCCESS],
    "simple/no-tools/t-0/r-medium": [SUCCESS],
    "simple/no-tools/t-0/r-high": [SUCCESS],
    "simple/no-tools/t-0/r-maximal": [SUCCESS],
    "simple/no-tools/t-0.1/r-default": [SUCCESS],
    "simple/no-tools/t-0.1/r-none": [SUCCESS],
    "simple/no-tools/t-0.1/r-minimal": [SUCCESS],
    "simple/no-tools/t-0.1/r-low": [SUCCESS],
    "simple/no-tools/t-0.1/r-medium": [SUCCESS],
    "simple/no-tools/t-0.1/r-high": [SUCCESS],
    "simple/no-tools/t-0.1/r-maximal": [SUCCESS],
    "simple/no-tools/t-1/r-default": [SUCCESS],
    "simple/no-tools/t-1/r-none": [SUCCESS],
    "simple/no-tools/t-1/r-minimal": [SUCCESS],
    "simple/no-tools/t-1/r-low": [SUCCESS],
    "simple/no-tools/t-1/r-medium": [SUCCESS],
    "simple/no-tools/t-1/r-high": [SUCCESS],
    "simple/no-tools/t-1/r-maximal": [SUCCESS],

    "calc/calc/t-default/r-medium": [SUCCESS],
    "calc/calc/t-0.1/r-default": [SUCCESS],
    "calc/calc/t-0.1/r-medium": [SUCCESS],
    "calc/calc/t-default/r-default/force-tool-default": [SUCCESS],
    "calc/calc/t-default/r-default/force-tool": [SUCCESS],
    "calc/calc/t-default/r-none/force-tool": [SUCCESS],

    "reasoning/no-tools/t-default/r-none": [SUCCESS],
    "reasoning/no-tools/t-default/r-low": [SUCCESS],

    "output-format/json-schema/t-default/r-none": [SUCCESS],
    "output-format/json-schema/t-default/r-high": [SUCCESS],

    "following/no-tools/t-default/r-default": [SUCCESS],

    "cache/no-tools/t-default/r-default": [SUCCESS],
  },
};

// NODE_ENV=test RUN_LLM_TEST=true npm run test -- --config lib/model_constructors/test/vite.config.js --bail 1 lib/model_constructors/test/endpoints/noop_global_noop.test.ts
runStreamEndpointTests(NoopGlobalNoopStream, NoopGlobalNoopStreamSetup);
