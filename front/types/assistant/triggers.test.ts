import { getTriggerExecutionMode } from "@app/types/assistant/triggers";
import { describe, expect, it } from "vitest";

describe("getTriggerExecutionMode", () => {
  it("maps legacy modes onto their pool", () => {
    expect(getTriggerExecutionMode("fair_use")).toBe("user_pool");
    expect(getTriggerExecutionMode("programmatic")).toBe("workspace_pool");
  });

  it("treats an unset mode as the user pool", () => {
    expect(getTriggerExecutionMode(null)).toBe("user_pool");
  });

  it("passes pool modes through", () => {
    expect(getTriggerExecutionMode("user_pool")).toBe("user_pool");
    expect(getTriggerExecutionMode("workspace_pool")).toBe("workspace_pool");
  });
});
