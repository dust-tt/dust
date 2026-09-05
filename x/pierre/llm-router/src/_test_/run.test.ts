import assertNever from "assert-never";
import { assert, describe, it } from "vitest";

import { SETUPS } from "@/_test_/setup";
import {
  type ResponseChecker,
  TEST_CASES,
  type TestCase,
} from "@/_test_/types";
import type { LargeLanguageModel } from "@/index";
import type { LargeLanguageModelResponseEvent } from "@/types/events";
import { type LargeLanguageModelId, MODELS } from "@/types/providers";

async function collectEvents(
  streamCallback: typeof LargeLanguageModel.prototype.stream,
  testCase: TestCase,
): Promise<LargeLanguageModelResponseEvent[]> {
  const events: LargeLanguageModelResponseEvent[] = [];
  for await (const event of streamCallback(
    { conversation: testCase.conversation },
    testCase.config,
  )) {
    events.push(event);
  }
  return events;
}

function checkResponseChecker(
  checker: ResponseChecker,
  events: LargeLanguageModelResponseEvent[],
): void {
  const lastEvent = events[events.length - 1];
  switch (checker.type) {
    case "error":
      assert(
        lastEvent?.type === "error",
        `Expected last event to be error, but got\n\n: ${JSON.stringify(lastEvent)}`,
      );
      assert(
        lastEvent.content.type === checker.contentType,
        `Expected error content type to be "${checker.contentType}", but got: "${lastEvent.content.type}"`,
      );
      break;
    case "success":
      assert(
        lastEvent?.type === "success",
        `Expected last event to be success, but got:\n\n ${JSON.stringify(lastEvent)}`,
      );
      break;
    case "tool_call": {
      assert(
        lastEvent?.type === "success",
        `Expected last event to contain a tool call, but got:\n\n ${JSON.stringify(lastEvent)}`,
      );
      const lastAggregatedEvent =
        lastEvent.content.aggregated[lastEvent.content.aggregated.length - 1];
      assert(
        lastAggregatedEvent !== undefined,
        "Expected at least one aggregated event, but got undefined",
      );
      assert(
        lastAggregatedEvent.type === "tool_call",
        `Expected last aggregated event to be a tool call, but got type "${lastAggregatedEvent.type}" — full event: ${JSON.stringify(lastAggregatedEvent)}`,
      );
      assert(
        lastAggregatedEvent.content.name === checker.name,
        `Expected tool call name to be "${checker.name}", but got "${lastAggregatedEvent.content.name}"`,
      );
      break;
    }
    case "text_contains": {
      assert(
        lastEvent?.type === "success",
        `Expected last event to be success, but got:\n\n ${JSON.stringify(lastEvent)}`,
      );
      const lastAgg =
        lastEvent.content.aggregated[lastEvent.content.aggregated.length - 1];
      assert(
        lastAgg !== undefined,
        "Expected at least one aggregated event, but got undefined",
      );
      assert(
        lastAgg.type === "text",
        `Expected last aggregated event to be text, but got type "${lastAgg.type}"`,
      );
      assert(
        lastAgg.content.value
          .toLowerCase()
          .includes(checker.value.toLowerCase()),
        `Expected text to contain "${checker.value}", but got: "${lastAgg.content.value}"`,
      );
      break;
    }
    case "has_reasoning": {
      assert(
        lastEvent?.type === "success",
        `Expected last event to be success, but got:\n\n ${JSON.stringify(lastEvent)}`,
      );
      assert(
        lastEvent.content.aggregated.some((e) => e.type === "reasoning") ===
          true,
        "Expected at least one aggregated event with reasoning, but got undefined",
      );
      break;
    }
    case "has_no_reasoning": {
      assert(
        lastEvent?.type === "success",
        `Expected last event to be success, but got:\n\n ${JSON.stringify(lastEvent)}`,
      );
      assert(
        lastEvent.content.aggregated.some((e) => e.type === "reasoning") ===
          false,
        "Expected no aggregated event with reasoning, but got at least one",
      );
      break;
    }
    default:
      assertNever(checker);
  }
}

const allModelIds = MODELS.map(
  (m) => `${m.providerId}/${m.modelId}` as LargeLanguageModelId,
);
const testedModels = allModelIds.filter((id) => SETUPS[id].shouldRun);
const skippedModels = allModelIds.filter((id) => !SETUPS[id].shouldRun);

if (skippedModels.length > 0) {
  console.warn(
    `\n\x1b[33m${"=".repeat(60)}\n` +
      `🧪 Testing ${testedModels.length}/${allModelIds.length} model(s):\n` +
      `\x1b[32m${testedModels.map((id) => `   ✓ ${id}`).join("\n")}\n` +
      `\x1b[33m⏭️  Skipping ${skippedModels.length} model(s):\n` +
      `\x1b[2m${skippedModels.map((id) => `   - ${id}`).join("\n")}\x1b[0m\n` +
      `\x1b[33m${"=".repeat(60)}\x1b[0m\n`,
  );
}

const allTestEntries = Object.entries(TEST_CASES) as [
  keyof typeof TEST_CASES,
  TestCase,
][];

// How these tests run:
// - Only models with `shouldRun: true` in SETUP are tested.
// - If any test case in TEST_CASES has `focus: true`, only those cases run.
//   Otherwise all test cases run. Use `focus` to iterate quickly on a subset.
// - vitest.config.ts sets `bail` so that the suite stops on first failure,
//   avoiding burning API tokens on a broken run.
// When no models are selected, `.each([])` registers zero suites and vitest
// errors with "No test suite found". We use a plain skipped describe as fallback
// so the file always contains at least one suite.
if (testedModels.length === 0) {
  describe.skip("(no models selected)", () => {
    it.skip("skipped", () => {});
  });
} else {
  describe.each(testedModels)("%s", (id) => {
    const { instance, tests } = SETUPS[id];

    const modelTests = allTestEntries.filter(
      ([testId]) => tests[testId].shouldRun !== false,
    );

    console.warn(
      `\n\x1b[33m${"=".repeat(60)}\n🧪 ${instance.id}\n⚠️  Running ${modelTests.length}/${allTestEntries.length} focused test case(s):\n${modelTests.map(([id]) => `   - ${id}`).join("\n")}\n${"=".repeat(60)}\x1b[0m\n`,
    );

    it.skipIf(modelTests.length === 0).each(modelTests)(
      "[%s]",
      async (testId: keyof typeof TEST_CASES, testCase: TestCase) => {
        const events = await collectEvents(
          tests[testId].debug
            ? instance.streamWithDebug.bind(instance)
            : instance.stream.bind(instance),
          testCase,
        );
        for (const checker of tests[testId].checkers ??
          testCase.defaultCheckers) {
          checkResponseChecker(checker, events);
        }
      },
      20_000,
    );
  });
}
