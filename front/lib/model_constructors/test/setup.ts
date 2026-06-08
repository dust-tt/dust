import type { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type {
  ResponseChecker,
  TestKey,
} from "@app/lib/model_constructors/test/cases";

// Per-endpoint test setup. Each stream endpoint has its own `*.test.ts` file
// that builds one of these and hands it to `runStreamEndpointTests`. Every shared
// `TEST_CASES` entry always runs; `tests` only carries per-case checker overrides.
// A case mapped to a checker array asserts those checkers (instead of the case's
// `defaultCheckers`); a case mapped to `null` runs with its own `defaultCheckers`.
export type StreamSetup = {
  // Factory function — instantiation is deferred so that a missing API key
  // doesn't blow up when the file is loaded without RUN_LLM_TEST=true.
  createInstance: () => StreamEndpoint<any, any>;
  debug?: boolean; // Optional global debug flag to dump artifacts for all cases of the endpoint.
  tests: Record<TestKey, ResponseChecker[] | null>;
};
