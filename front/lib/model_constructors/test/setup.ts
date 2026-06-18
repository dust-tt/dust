import type { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type {
  ResponseChecker,
  TestKey,
} from "@app/lib/model_constructors/test/cases";

export type StreamSetup = {
  // Deferred so a missing API key doesn't blow up when loaded without RUN_LLM_TEST.
  createInstance: () => StreamEndpoint;
  debug?: boolean; // Dump artifacts for all cases of the endpoint.
  tests: Record<TestKey, ResponseChecker[] | null>;
};
