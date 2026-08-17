import { ThirdPartyConfigurationError } from "@connectors/lib/error";
import { GraphError } from "@microsoft/microsoft-graph-client";
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";
import { describe, expect, it, vi } from "vitest";

import { MicrosoftCastKnownErrorsInterceptor } from "./cast_known_errors";

describe("MicrosoftCastKnownErrorsInterceptor", () => {
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
