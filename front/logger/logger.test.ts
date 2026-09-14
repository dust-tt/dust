import logger from "@app/logger/logger";
import { describe, expectTypeOf, it } from "vitest";

describe("logger Datadog context typing", () => {
  it("accepts a real Datadog severity as status", () => {
    expectTypeOf(logger.info).toBeCallableWith(
      { status: "critical" },
      "message"
    );
  });

  it("accepts payloads without a status", () => {
    expectTypeOf(logger.info).toBeCallableWith({ itemId: "1" }, "message");
    expectTypeOf(logger.error).toBeCallableWith(new Error("boom"), "message");
    expectTypeOf(logger.info).toBeCallableWith("message");
  });

  it("rejects a status Datadog would misread as a severity", () => {
    // @ts-expect-error - "completed" is prefix-matched to critical by Datadog.
    expectTypeOf(logger.info).toBeCallableWith({ status: "completed" }, "msg");
  });

  it("rejects elapsed and accepts elapsedMs", () => {
    expectTypeOf(logger.info).toBeCallableWith({ elapsedMs: 12 }, "message");
    // @ts-expect-error - Datadog reserves elapsed and may replace its value.
    expectTypeOf(logger.info).toBeCallableWith({ elapsed: 12 }, "message");
  });
});
