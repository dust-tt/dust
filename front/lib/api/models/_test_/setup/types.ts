import type { WithStreamDebugInstance } from "@app/lib/api/models/_test_/setup/utils";
import type {
  ResponseChecker,
  TestKey,
} from "@app/lib/api/models/_test_/types";

export type Setup = {
  // Factory function — instantiation is deferred so that missing API keys
  // don't blow up when the test file is loaded without RUN_LLM_TEST=true.
  createInstance: () => WithStreamDebugInstance;
  tests: Record<
    TestKey,
    { checkers?: ResponseChecker[]; shouldRun: boolean; debug?: boolean }
  >;
  // Do not change to `boolean`. This is intentionally `false` so that CI never
  // burns tokens. To run a specific setup locally, temporarily set it to `true`.
  shouldRun: false;
};
