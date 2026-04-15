// @vitest-environment node

import { SETUPS } from "@app/lib/api/models/_test_/setup";
import {
  type ResponseChecker,
  TEST_CASES,
  type TestCase,
} from "@app/lib/api/models/_test_/types";
import type { LargeLanguageModel } from "@app/lib/api/models/index";
import type { LargeLanguageModelResponseEvent } from "@app/lib/api/models/types/events";
import {
  type LargeLanguageModelId,
  MODELS,
} from "@app/lib/api/models/types/providers";
// biome-ignore lint/plugin/noAppImportsInModels: monorepo-global utility with no domain meaning
import { assertNever } from "@app/types/shared/utils/assert_never";
// biome-ignore lint/plugin/noAppImportsInModels: monorepo-global utility with no domain meaning
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import Ajv from "ajv";
import { assert, describe, it } from "vitest";

async function collectEvents(
  streamCallback: typeof LargeLanguageModel.prototype.stream,
  testCase: TestCase
): Promise<LargeLanguageModelResponseEvent[]> {
  const events: LargeLanguageModelResponseEvent[] = [];
  for await (const event of streamCallback(
    { conversation: testCase.conversation },
    testCase.config
  )) {
    events.push(event);
  }
  return events;
}

function checkResponseChecker(
  checker: ResponseChecker,
  events: LargeLanguageModelResponseEvent[]
): void {
  const lastEvent = events[events.length - 1];
  switch (checker.type) {
    case "error":
      assert(
        lastEvent?.type === "error",
        `Expected last event to be error, but got\n\n: ${JSON.stringify(lastEvent)}`
      );
      assert(
        lastEvent.content.type === checker.contentType,
        `Expected error content type to be "${checker.contentType}", but got: "${lastEvent.content.type}"`
      );
      break;
    case "success":
      assert(
        lastEvent?.type === "success",
        `Expected last event to be success, but got:\n\n ${JSON.stringify(lastEvent)}`
      );
      break;
    case "tool_call": {
      assert(
        lastEvent?.type === "success",
        `Expected last event to contain a tool call, but got:\n\n ${JSON.stringify(lastEvent)}`
      );
      assert(
        lastEvent.content.aggregated.length > 0,
        "Expected at least one aggregated event."
      );
      assert(
        lastEvent.content.aggregated.find(
          ({ type, content }) =>
            type === "tool_call" && content.name === checker.name
        ) !== undefined,
        `Expected aggregated events to contain the ${checker.name} tool call.`
      );
      break;
    }
    case "text_contains": {
      assert(
        lastEvent?.type === "success",
        `Expected last event to be success, but got:\n\n ${JSON.stringify(lastEvent)}`
      );
      const lastAgg =
        lastEvent.content.aggregated[lastEvent.content.aggregated.length - 1];
      assert(
        lastAgg !== undefined,
        "Expected at least one aggregated event, but got undefined"
      );
      assert(
        lastAgg.type === "text",
        `Expected last aggregated event to be text, but got type "${lastAgg.type}"`
      );
      assert(
        lastAgg.content.value
          .toLowerCase()
          .includes(checker.value.toLowerCase()),
        `Expected text to contain "${checker.value}", but got: "${lastAgg.content.value}"`
      );
      break;
    }
    case "has_reasoning": {
      assert(
        lastEvent?.type === "success",
        `Expected last event to be success, but got:\n\n ${JSON.stringify(lastEvent)}`
      );
      assert(
        lastEvent.content.aggregated.some((e) => e.type === "reasoning") ===
          true,
        "Expected at least one aggregated event with reasoning, but got undefined"
      );
      break;
    }
    case "has_no_reasoning": {
      assert(
        lastEvent?.type === "success",
        `Expected last event to be success, but got:\n\n ${JSON.stringify(lastEvent)}`
      );
      assert(
        lastEvent.content.aggregated.some((e) => e.type === "reasoning") ===
          false,
        "Expected no aggregated event with reasoning, but got at least one"
      );
      break;
    }
    case "valid_output_format": {
      assert(
        lastEvent?.type === "success",
        `Expected last event to be success, but got:\n\n ${JSON.stringify(lastEvent)}`
      );
      const lastAgg =
        lastEvent.content.aggregated[lastEvent.content.aggregated.length - 1];
      assert(
        lastAgg !== undefined,
        "Expected at least one aggregated event, but got undefined"
      );
      assert(
        lastAgg.type === "text",
        `Expected last aggregated event to be text, but got type "${lastAgg.type}"`
      );
      const parsed = safeParseJSON(lastAgg.content.value);
      if (!parsed.isOk()) {
        assert.fail(
          `Expected valid JSON, but got:\n\n${lastAgg.content.value}`
        );
      }

      const ajv = new Ajv();
      const validate = ajv.compile(checker.format.json_schema.schema);
      const valid = validate(parsed.value);
      assert(
        valid,
        `Expected payload to match JSON schema, but got errors:\n${JSON.stringify(validate.errors, null, 2)}\n\nPayload: ${JSON.stringify(parsed.value, null, 2)}`
      );
      break;
    }
    default:
      assertNever(checker);
  }
}

const allModelIds = MODELS.map(
  (m) => `${m.providerId}/${m.modelId}` as LargeLanguageModelId
);
const testedModels = allModelIds.filter((id) => SETUPS[id].shouldRun);
const skippedModels = allModelIds.filter((id) => !SETUPS[id].shouldRun);

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

/**
 * Run from root with:
 *   NODE_ENV=test RUN_LLM_TEST=true npx -w front vitest --config lib/api/models/_test_/vite.config.js lib/api/models/_test_/run.test.ts --run --bail 1
 */
if (process.env.NODE_ENV !== "test") {
  console.warn(
    `\n\x1b[33m${"=".repeat(60)}\n` +
      `⏭️  Skipping LLM tests (NODE_ENV is not "test").\n` +
      `\x1b[33m${"=".repeat(60)}\x1b[0m\n`
  );

  describe.skip("(NODE_ENV is not 'test')", () => {
    it.skip("skipped", () => undefined);
  });
} else if (process.env.RUN_LLM_TEST !== "true") {
  console.warn(
    `\n\x1b[33m${"=".repeat(60)}\n` +
      `⏭️  Skipping LLM tests (RUN_LLM_TEST is not set).\n` +
      `\x1b[33m${"=".repeat(60)}\x1b[0m\n`
  );
  describe.skip("(RUN_LLM_TEST is not set)", () => {
    it.skip("skipped", () => undefined);
  });
} else if (testedModels.length === 0) {
  console.warn(
    `\n\x1b[33m${"=".repeat(60)}\n` +
      `⏭️  No models selected to run.\n` +
      `\x1b[2m${skippedModels.map((id) => `   - ${id}`).join("\n")}\x1b[0m\n` +
      `\x1b[33m${"=".repeat(60)}\x1b[0m\n`
  );
  describe.skip("(no models selected)", () => {
    it.skip("skipped", () => undefined);
  });
} else {
  describe.each(testedModels)("%s", (id) => {
    const { createInstance, tests } = SETUPS[id];
    const instance = createInstance();

    const modelTests = allTestEntries.filter(
      ([testId]) => tests[testId].shouldRun !== false
    );

    console.warn(
      `\n\x1b[33m${"=".repeat(60)}\n🧪 ${instance.id}\n⚠️  Running ${modelTests.length}/${allTestEntries.length} focused test case(s):\n${modelTests.map(([id]) => `   - ${id}`).join("\n")}\n${"=".repeat(60)}\x1b[0m\n`
    );

    it.skipIf(modelTests.length === 0).each(modelTests)(
      "[%s]",
      async (testId: keyof typeof TEST_CASES, testCase: TestCase) => {
        const events = await collectEvents(
          tests[testId].debug
            ? instance.streamWithDebug.bind(instance)
            : instance.stream.bind(instance),
          testCase
        );
        for (const checker of tests[testId].checkers ??
          testCase.defaultCheckers) {
          checkResponseChecker(checker, events);
        }
      },
      20_000
    );
  });
}
