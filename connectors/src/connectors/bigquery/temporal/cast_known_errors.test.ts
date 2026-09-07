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

import { BigQueryCastKnownErrorsInterceptor } from "./cast_known_errors";

const input = { args: [], headers: {} } satisfies ActivityExecuteInput;

describe("BigQueryCastKnownErrorsInterceptor", () => {
  it("classifies a VPC Service Controls denial as a terminal configuration error", async () => {
    const message =
      "VPC Service Controls: Request is prohibited by organization's policy. " +
      "vpcServiceControlsUniqueIdentifier: test-violation-id.";
    const error = Object.assign(new Error(message), {
      name: "ApiError",
      code: 403,
      errors: [{ domain: "global", message, reason: "policyViolation" }],
    });
    const next = vi.fn(async () => {
      throw error;
    }) satisfies Next<ActivityInboundCallsInterceptor, "execute">;

    const execution = new BigQueryCastKnownErrorsInterceptor().execute(
      input,
      next
    );

    await expect(execution).rejects.toThrow(ThirdPartyConfigurationError);
    await expect(execution).rejects.toHaveProperty("cause", error);
  });

  it.each([
    { code: 403, reason: "rateLimitExceeded" },
    { code: 403, reason: "accessDenied" },
    { code: 500, reason: "policyViolation" },
    { code: 503, reason: "backendError" },
  ])("preserves $code $reason errors for existing retry handling", async ({
    code,
    reason,
  }) => {
    const error = Object.assign(new Error("BigQuery request failed"), {
      name: "ApiError",
      code,
      errors: [{ reason }],
    });
    const next = vi.fn(async () => {
      throw error;
    }) satisfies Next<ActivityInboundCallsInterceptor, "execute">;

    await expect(
      new BigQueryCastKnownErrorsInterceptor().execute(input, next)
    ).rejects.toBe(error);
  });

  it("preserves errors without structured policy details", async () => {
    const error = Object.assign(new Error("Request is prohibited"), {
      code: 403,
    });
    const next = vi.fn(async () => {
      throw error;
    }) satisfies Next<ActivityInboundCallsInterceptor, "execute">;

    await expect(
      new BigQueryCastKnownErrorsInterceptor().execute(input, next)
    ).rejects.toBe(error);
  });

  it("still classifies revoked accounts as OAuth errors", async () => {
    const error = new Error("invalid_grant: Invalid grant: account not found");
    const next = vi.fn(async () => {
      throw error;
    }) satisfies Next<ActivityInboundCallsInterceptor, "execute">;

    await expect(
      new BigQueryCastKnownErrorsInterceptor().execute(input, next)
    ).rejects.toThrow(ExternalOAuthTokenError);
  });

  it("returns successful activity results unchanged", async () => {
    const result = { synced: true };
    const next = vi.fn(async () => result) satisfies Next<
      ActivityInboundCallsInterceptor,
      "execute"
    >;

    await expect(
      new BigQueryCastKnownErrorsInterceptor().execute(input, next)
    ).resolves.toBe(result);
  });
});
