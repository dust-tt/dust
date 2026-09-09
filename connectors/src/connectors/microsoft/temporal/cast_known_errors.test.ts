import {
  ExternalOAuthTokenError,
  ThirdPartyConfigurationError,
} from "@connectors/lib/error";
import { GraphError } from "@microsoft/microsoft-graph-client";
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";
import { describe, expect, it, vi } from "vitest";

import { MicrosoftCastKnownErrorsInterceptor } from "./cast_known_errors";

describe("MicrosoftCastKnownErrorsInterceptor", () => {
  it("classifies Graph authentication failures as OAuth errors and preserves the cause", async () => {
    const error = new GraphError(
      401,
      "There has been an error authenticating the request."
    );
    error.code = "accessDenied";
    const next = vi.fn(async () => {
      throw error;
    }) satisfies Next<ActivityInboundCallsInterceptor, "execute">;

    const result = new MicrosoftCastKnownErrorsInterceptor().execute(
      { args: [], headers: {} } satisfies ActivityExecuteInput,
      next
    );

    await expect(result).rejects.toBeInstanceOf(ExternalOAuthTokenError);
    await expect(result).rejects.toHaveProperty("cause", error);
  });

  it.each([
    404, 429, 503,
  ])("preserves Graph %i failures for existing retry handling", async (statusCode) => {
    const error = new GraphError(statusCode, "Microsoft Graph request failed");
    const next = vi.fn(async () => {
      throw error;
    }) satisfies Next<ActivityInboundCallsInterceptor, "execute">;

    await expect(
      new MicrosoftCastKnownErrorsInterceptor().execute(
        { args: [], headers: {} } satisfies ActivityExecuteInput,
        next
      )
    ).rejects.toBe(error);
  });

  it("classifies a missing SharePoint license as a terminal configuration error", async () => {
    const error = new GraphError(400, "Tenant does not have a SPO license.");
    const next = vi.fn(async () => {
      throw error;
    }) satisfies Next<ActivityInboundCallsInterceptor, "execute">;

    await expect(
      new MicrosoftCastKnownErrorsInterceptor().execute(
        { args: [], headers: {} } satisfies ActivityExecuteInput,
        next
      )
    ).rejects.toEqual(new ThirdPartyConfigurationError(error));
  });
});
