import { ThirdPartyConfigurationError } from "@connectors/lib/error";
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";
import { describe, expect, it, vi } from "vitest";

import { SnowflakeCastKnownErrorsInterceptor } from "./cast_known_errors";

describe("SnowflakeCastKnownErrorsInterceptor", () => {
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
