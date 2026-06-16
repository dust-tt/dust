import type {
  StreamEndpointConstructor,
  StreamModelConfiguration,
} from "@app/lib/model_constructors/stream/configuration";
import type { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import {
  type ResponseChecker,
  TEST_CASES,
  type TestCase,
  type TestKey,
} from "@app/lib/model_constructors/test/cases";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";
import { runStream } from "@app/lib/model_constructors/test/stream";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import Ajv from "ajv";
import { assert, describe, it } from "vitest";

async function collectEvents(
  instance: StreamEndpoint<any, any>,
  configSchema: StreamModelConfiguration["configSchema"],
  testCase: TestCase,
  debug: boolean
): Promise<ModelResponseEvent[]> {
  const events: ModelResponseEvent[] = [];
  for await (const event of runStream(
    instance,
    configSchema,
    { conversation: testCase.conversation },
    testCase.config,
    { debug }
  )) {
    events.push(event);
  }
  return events;
}

function checkResponseChecker(
  checker: ResponseChecker,
  events: ModelResponseEvent[]
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

// Registers the shared `TEST_CASES` suite for a single stream endpoint. Gated on
// NODE_ENV=test and RUN_LLM_TEST=true so CI never burns API tokens. Run with:
// NODE_ENV=test RUN_LLM_TEST=true npm run test --config lib/model_constructors/test/vite.config.js lib/model_constructors/test/endpoints/<endpoint>.test.ts --run --bail 1
export function runStreamEndpointTests(
  ModelClass: StreamEndpointConstructor,
  setup: StreamSetup
): void {
  const { id } = ModelClass;

  if (process.env.NODE_ENV !== "test") {
    console.warn(
      `\n\x1b[33m${"=".repeat(60)}\n` +
        `⏭️  Skipping LLM tests (NODE_ENV is not "test").\n` +
        `\x1b[33m${"=".repeat(60)}\x1b[0m\n`
    );
    describe.skip(`${id} (NODE_ENV is not 'test')`, () => {
      it.skip("skipped", () => undefined);
    });
    return;
  }

  if (process.env.RUN_LLM_TEST !== "true") {
    console.warn(
      `\n\x1b[33m${"=".repeat(60)}\n` +
        `⏭️  Skipping LLM tests (RUN_LLM_TEST is not set).\n` +
        `\x1b[33m${"=".repeat(60)}\x1b[0m\n`
    );
    describe.skip(`${id} (RUN_LLM_TEST is not set)`, () => {
      it.skip("skipped", () => undefined);
    });
    return;
  }

  const { configSchema } = ModelClass;
  const { createInstance, tests, debug = false } = setup;

  const testIds = Object.keys(tests) as TestKey[];
  const totalTestCases = Object.keys(TEST_CASES).length;

  describe(id, () => {
    const instance = createInstance();

    console.warn(
      `\n\x1b[33m${"=".repeat(60)}\n🧪 ${id}\n⚠️  Running ${testIds.length}/${totalTestCases} test case(s):\n${testIds.map((testId) => `   - ${testId}`).join("\n")}\n${"=".repeat(60)}\x1b[0m\n`
    );

    it.each(testIds)("[%s]", async (testId: TestKey) => {
      const testCase = TEST_CASES[testId];
      const events = await collectEvents(
        instance,
        configSchema,
        testCase,
        debug
      );
      // A `null` override falls back to the case's default checkers.
      for (const checker of tests[testId] ?? testCase.defaultCheckers) {
        checkResponseChecker(checker, events);
      }
    }, 20_000);
  });
}
