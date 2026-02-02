import type {
  CategorizedTestCase,
  TestSuite,
} from "@app/tests/copilot-evals/lib/types";

/**
 * Filter test cases from suites based on criteria.
 * Automatically assigns category to each test case based on suite name.
 */
export function filterTestCases(
  suites: TestSuite[],
  options?: {
    category?: string;
    scenarioId?: string;
  }
): CategorizedTestCase[] {
  let allTests: CategorizedTestCase[] = [];

  for (const suite of suites) {
    const categorizedCases = suite.testCases.map((tc) => ({
      ...tc,
      category: suite.name,
    }));
    allTests = allTests.concat(categorizedCases);
  }

  if (options?.category) {
    allTests = allTests.filter((tc) => tc.category === options.category);
  }

  if (options?.scenarioId) {
    allTests = allTests.filter((tc) => tc.scenarioId === options.scenarioId);
  }

  return allTests;
}
