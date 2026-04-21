import type {
  CategorizedTakeawayTestCase,
  TakeawayTestSuite,
} from "@app/tests/takeaway-evals/lib/types";

/**
 * Filter test cases from suites based on criteria.
 * Automatically assigns suiteName to each test case based on suite name.
 */
export function filterTestCases(
  suites: TakeawayTestSuite[],
  options?: {
    scenarioId?: string;
  }
): CategorizedTakeawayTestCase[] {
  let allTests: CategorizedTakeawayTestCase[] = [];

  for (const suite of suites) {
    const categorizedCases = suite.testCases.map((tc) => ({
      ...tc,
      suiteName: suite.name,
    }));
    allTests = allTests.concat(categorizedCases);
  }

  if (options?.scenarioId) {
    allTests = allTests.filter((tc) => tc.scenarioId === options.scenarioId);
  }

  return allTests;
}
