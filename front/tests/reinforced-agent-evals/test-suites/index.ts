import type { TestSuite } from "@app/tests/reinforced-agent-evals/lib/types";
import { aggregateSuggestionsSuite } from "@app/tests/reinforced-agent-evals/test-suites/aggregate-suggestions";
import { analyzeConversationSuite } from "@app/tests/reinforced-agent-evals/test-suites/analyze-conversation";

export const allTestSuites: TestSuite[] = [
  analyzeConversationSuite,
  aggregateSuggestionsSuite,
];
