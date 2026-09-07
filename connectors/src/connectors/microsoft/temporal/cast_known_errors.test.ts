import { MicrosoftThrottlingError } from "@connectors/connectors/microsoft/lib/errors";
import {
  ExternalOAuthTokenError,
  ThirdPartyConfigurationError,
} from "@connectors/lib/error";
import { GraphError } from "@microsoft/microsoft-graph-client";
import { ApplicationFailure } from "@temporalio/common";
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";
import { describe, expect, it, vi } from "vitest";

import { MicrosoftCastKnownErrorsInterceptor } from "./cast_known_errors";

const input = { args: [], headers: {} } satisfies ActivityExecuteInput;

describe("MicrosoftCastKnownErrorsInterceptor", () => {
  it("classifies blocked site access as a terminal configuration error", async () => {
    const message =
      "Access to this site has been blocked. Please contact the administrator to resolve this problem.";
    const error = new GraphError(423, message);
    error.code = "notAllowed";
    error.body = JSON.stringify({
      code: "notAllowed",
      innerError: { code: "resourceLocked" },
      message,
    });
    const next = vi.fn(async () => {
      throw error;
    }) satisfies Next<ActivityInboundCallsInterceptor, "execute">;

    const execution = new MicrosoftCastKnownErrorsInterceptor().execute(
      input,
      next
    );

    await expect(execution).rejects.toThrow(ThirdPartyConfigurationError);
    await expect(execution).rejects.toHaveProperty("cause", error);
  });

  it("classifies a missing SharePoint license as a terminal configuration error", async () => {
    const error = new GraphError(400, "Tenant does not have a SPO license.");
    const next = vi.fn(async () => {
      throw error;
    }) satisfies Next<ActivityInboundCallsInterceptor, "execute">;

    await expect(
      new MicrosoftCastKnownErrorsInterceptor().execute(input, next)
    ).rejects.toThrow(ThirdPartyConfigurationError);
  });

  it.each([
    { statusCode: 403, code: "notAllowed" },
    { statusCode: 423, code: "generalException" },
    { statusCode: 429, code: "activityLimitReached" },
    { statusCode: 503, code: "serviceNotAvailable" },
  ])("preserves $statusCode $code errors for existing retry handling", async ({
    statusCode,
    code,
  }) => {
    const error = new GraphError(statusCode, "Microsoft Graph request failed");
    error.code = code;
    const next = vi.fn(async () => {
      throw error;
    }) satisfies Next<ActivityInboundCallsInterceptor, "execute">;

    await expect(
      new MicrosoftCastKnownErrorsInterceptor().execute(input, next)
    ).rejects.toBe(error);
  });

  it("preserves the retry delay for throttled requests", async () => {
    const error = new MicrosoftThrottlingError("/sites", 120_000);
    const next = vi.fn(async () => {
      throw error;
    }) satisfies Next<ActivityInboundCallsInterceptor, "execute">;

    const execution = new MicrosoftCastKnownErrorsInterceptor().execute(
      input,
      next
    );

    await expect(execution).rejects.toThrow(ApplicationFailure);
    await expect(execution).rejects.toMatchObject({
      cause: error,
      nextRetryDelay: 120_000,
    });
  });

  it("still classifies sign-in failures as OAuth errors", async () => {
    const error = new Error(
      "Error retrieving access token from microsoft: code=provider_access_token_refresh_error AADSTS50173"
    );
    const next = vi.fn(async () => {
      throw error;
    }) satisfies Next<ActivityInboundCallsInterceptor, "execute">;

    await expect(
      new MicrosoftCastKnownErrorsInterceptor().execute(input, next)
    ).rejects.toThrow(ExternalOAuthTokenError);
  });

  it("returns successful activity results unchanged", async () => {
    const result = { gcsFilePath: null, deltaTooLarge: false };
    const next = vi.fn(async () => result) satisfies Next<
      ActivityInboundCallsInterceptor,
      "execute"
    >;

    await expect(
      new MicrosoftCastKnownErrorsInterceptor().execute(input, next)
    ).resolves.toBe(result);
  });
});
