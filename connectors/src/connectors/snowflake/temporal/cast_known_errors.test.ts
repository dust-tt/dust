import {
  ExternalOAuthTokenError,
  ThirdPartyConfigurationError,
} from "@connectors/lib/error";
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";
import { describe, expect, it, vi } from "vitest";

import { SnowflakeCastKnownErrorsInterceptor } from "./cast_known_errors";

describe("SnowflakeCastKnownErrorsInterceptor", () => {
  it.each([
    { code: "390189", message: "Role not found" },
    { code: "390186", message: "Role not authorized" },
    { code: 390189, message: "Role not found" },
    { code: 390186, message: "Role not authorized" },
    { message: "Account is suspended" },
    { message: "User access disabled" },
    { message: "SQL access control error: insufficient privileges" },
    { message: "JWT token is invalid" },
  ])("preserves the original Error for $message ($code)", async (details) => {
    const error = Object.assign(new Error(details.message), details, {
      name: "OperationFailedError",
    });
    const next = vi.fn(async () => {
      throw error;
    }) satisfies Next<ActivityInboundCallsInterceptor, "execute">;

    await expect(
      new SnowflakeCastKnownErrorsInterceptor().execute(
        { args: [], headers: {} },
        next
      )
    ).rejects.toSatisfy(
      (caught: unknown) =>
        caught instanceof ExternalOAuthTokenError &&
        caught.cause === error &&
        caught.innerError === error
    );
  });

  it("normalizes a recognized plain provider payload before wrapping it", async () => {
    const error = {
      name: "OperationFailedError",
      code: "390189",
      message: "Role not found",
    };
    const next = vi.fn(async () => {
      throw error;
    }) satisfies Next<ActivityInboundCallsInterceptor, "execute">;

    await expect(
      new SnowflakeCastKnownErrorsInterceptor().execute(
        { args: [], headers: {} },
        next
      )
    ).rejects.toEqual(
      new ExternalOAuthTokenError(new Error(JSON.stringify(error)))
    );
  });

  it.each([
    null,
    undefined,
    "Request failed",
    42,
    false,
    new Error("Unexpected failure"),
    {},
    { name: "OperationFailedError" },
    { name: "OperationFailedError", message: null },
    { name: "OperationFailedError", message: 42 },
    { name: "OperationFailedError", message: {} },
    { name: "OperationFailedError", code: {} },
    { name: "OperationFailedError", code: "999999", message: "Unknown" },
  ])("rethrows unrecognized values unchanged: %j", async (error) => {
    const next = vi.fn(async () => {
      throw error;
    }) satisfies Next<ActivityInboundCallsInterceptor, "execute">;

    await expect(
      new SnowflakeCastKnownErrorsInterceptor().execute(
        { args: [], headers: {} },
        next
      )
    ).rejects.toBe(error);
  });

  it("classifies an expired listing trial as a terminal configuration error", async () => {
    const error = Object.assign(
      new Error("Listing trial time limit exceeded"),
      {
        code: "090693",
        name: "OperationFailedError",
      }
    );
    const next = vi.fn(async () => {
      throw error;
    }) satisfies Next<ActivityInboundCallsInterceptor, "execute">;

    await expect(
      new SnowflakeCastKnownErrorsInterceptor().execute(
        { args: [], headers: {} } satisfies ActivityExecuteInput,
        next
      )
    ).rejects.toEqual(new ThirdPartyConfigurationError(error));
  });
});
