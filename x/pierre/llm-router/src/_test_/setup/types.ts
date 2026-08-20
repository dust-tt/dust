import type { WithStreamDebugInstance } from "@/_test_/setup/utils";
import { type ResponseChecker, type TestKey } from "@/_test_/types";

export type Setup = {
  instance: WithStreamDebugInstance;
  tests: Record<
    TestKey,
    { checkers?: ResponseChecker[]; shouldRun: boolean; debug?: boolean }
  >;
  shouldRun: boolean;
};
