import {
  SANDBOX_DEFAULT_COMMAND_TIMEOUT_MS,
  SANDBOX_EXEC_TIMEOUT_BUFFER_MS,
  SANDBOX_MAX_COMMAND_TIMEOUT_MS,
  SANDBOX_MCP_REQUEST_TIMEOUT_MS,
  TOOL_ACTIVITY_START_TO_CLOSE_TIMEOUT_MS,
} from "@app/lib/actions/constants";
import { describe, expect, it } from "vitest";

describe("tool timeouts", () => {
  it("lets the sandbox default fit within the max the model can request", () => {
    expect(SANDBOX_DEFAULT_COMMAND_TIMEOUT_MS).toBeLessThanOrEqual(
      SANDBOX_MAX_COMMAND_TIMEOUT_MS
    );
  });

  it("stops a sandbox command in-container before the provider gives up", () => {
    expect(
      SANDBOX_MAX_COMMAND_TIMEOUT_MS + SANDBOX_EXEC_TIMEOUT_BUFFER_MS
    ).toBeLessThan(SANDBOX_MCP_REQUEST_TIMEOUT_MS);
  });

  it("aborts the MCP call before the tool activity times out", () => {
    expect(SANDBOX_MCP_REQUEST_TIMEOUT_MS).toBeLessThan(
      TOOL_ACTIVITY_START_TO_CLOSE_TIMEOUT_MS
    );
  });
});
