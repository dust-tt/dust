import type { TestSuite } from "@app/tests/reinforcement-evals/lib/types";
import { aggregateSuggestionsSuite } from "@app/tests/reinforcement-evals/test-suites/aggregate-suggestions";
import { analyzeConversationSuite } from "@app/tests/reinforcement-evals/test-suites/analyze-conversation";

export const allTestSuites: TestSuite[] = [
  analyzeConversationSuite,
  aggregateSuggestionsSuite,
];
