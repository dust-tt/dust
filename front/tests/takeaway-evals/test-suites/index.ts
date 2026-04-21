import type { TakeawayTestSuite } from "@app/tests/takeaway-evals/lib/types";
import { actionItemsSuite } from "@app/tests/takeaway-evals/test-suites/action-items";
import { keyDecisionsSuite } from "@app/tests/takeaway-evals/test-suites/key-decisions";
import { mixedExtractionSuite } from "@app/tests/takeaway-evals/test-suites/mixed-extraction";
import { notableFactsSuite } from "@app/tests/takeaway-evals/test-suites/notable-facts";

export const allTestSuites: TakeawayTestSuite[] = [
  actionItemsSuite,
  notableFactsSuite,
  keyDecisionsSuite,
  mixedExtractionSuite,
];
