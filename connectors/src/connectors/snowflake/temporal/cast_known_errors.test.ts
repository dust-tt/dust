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
    "Error",
    "OperationFailedError",
  ])("classifies MFA enrollment failures named %s as authorization errors", async (name) => {
    const error = new Error(
      "Multi-factor authentication is required for this account. Log in to Snowsight to enroll. [811d9584-fb2e-48a5-a7f8-f7f12f96cd1d]"
    );
    error.name = name;
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

  it.each([
    { code: "390189", message: "Role not found" },
    { code: "390186", message: "Role not authorized" },
    { code: 390189, message: "Role not found" },
    { code: 390186, message: "Role not authorized" },
    { message: "Account is suspended" },
    { message: "User access disabled" },
    { message: "SQL access control error: insufficient privileges" },
    { message: "JWT token is invalid" },
    {
      message:
        "Session no longer exists.  New login required to access the service.",
    },
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

  it.each([
    {
      message:
        "Multi-factor authentication is required for this account. Log in to Snowsight to enroll. [811d9584-fb2e-48a5-a7f8-f7f12f96cd1d]",
    },
    {
      name: "OperationFailedError",
      code: "390189",
      message: "Role not found",
    },
    {
      name: "OperationFailedError",
      message:
        "Session no longer exists.  New login required to access the service.",
    },
  ])("normalizes a recognized plain provider payload before wrapping it: $message", async (error) => {
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
    {
      name: "UnexpectedError",
      message:
        "Session no longer exists.  New login required to access the service.",
    },
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
