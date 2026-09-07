import {
  FrameFunctionInvocationParamsSchema,
  PostFrameFunctionInvocationBodySchema,
} from "@front-api/lib/api/frame_function_invocation_schemas";
import { describe, expect, it } from "vitest";

describe("canonical Frame invocation schemas", () => {
  it("accepts a Frame id, bare function name, and invocation body", () => {
    expect(
      FrameFunctionInvocationParamsSchema.safeParse({
        frameId: "fil_frame",
        name: "run-function",
      }).success
    ).toBe(true);
    expect(
      PostFrameFunctionInvocationBodySchema.safeParse({
        input: { message: "hello" },
        context: { timezone: "Europe/Paris" },
      }).success
    ).toBe(true);
  });

  it("rejects qualified names and unknown body fields", () => {
    expect(
      FrameFunctionInvocationParamsSchema.safeParse({
        frameId: "fil_frame",
        name: "fil_other/run-function",
      }).success
    ).toBe(false);
    expect(
      PostFrameFunctionInvocationBodySchema.safeParse({ extra: true }).success
    ).toBe(false);
  });
});
