import {
  isToolExecutionStatus,
  TOOL_EXECUTION_STATUSES,
} from "@app/lib/actions/statuses";
import { describe, expect, it } from "vitest";

describe("isToolExecutionStatus", () => {
  it("accepts every persisted tool status", () => {
    expect(TOOL_EXECUTION_STATUSES.every(isToolExecutionStatus)).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isToolExecutionStatus("unknown")).toBe(false);
  });
});
