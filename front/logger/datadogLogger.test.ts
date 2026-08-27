import datadogLogger from "@app/logger/datadogLogger";
import { describe, expectTypeOf, it } from "vitest";

describe("datadog logger context typing", () => {
  it("accepts a real Datadog severity as status", () => {
    expectTypeOf(datadogLogger.info).toBeCallableWith(
      { status: "critical" },
      "message"
    );
  });

  it("accepts payloads without a status", () => {
    expectTypeOf(datadogLogger.info).toBeCallableWith(
      { itemId: "1" },
      "message"
    );
    expectTypeOf(datadogLogger.info).toBeCallableWith("message");
  });

  it("rejects a status Datadog would misread as a severity", () => {
    expectTypeOf(datadogLogger.info).toBeCallableWith(
      // @ts-expect-error - "completed" is prefix-matched to critical by Datadog.
      { status: "completed" },
      "msg"
    );
    expectTypeOf(datadogLogger.child).toBeCallableWith({
      // @ts-expect-error - child bindings are logged as a top-level status too.
      status: "completed",
    });
  });

  it("rejects elapsed and accepts elapsedMs", () => {
    expectTypeOf(datadogLogger.info).toBeCallableWith(
      { elapsedMs: 12 },
      "message"
    );
    expectTypeOf(datadogLogger.info).toBeCallableWith(
      // @ts-expect-error - Datadog reserves elapsed and may replace its value.
      { elapsed: 12 },
      "message"
    );
    expectTypeOf(datadogLogger.child).toBeCallableWith({
      // @ts-expect-error - child bindings are logged as top-level fields too.
      elapsed: 12,
    });
  });
});
