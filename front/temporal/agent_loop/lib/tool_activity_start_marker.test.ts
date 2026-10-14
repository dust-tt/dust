import { describe, expect, it } from "vitest";

import type { ToolActivityExecution } from "./tool_activity_start_marker";
import {
  claimToolActivityNeverStarted,
  claimToolActivityStart,
} from "./tool_activity_start_marker";

function makeExecution(): ToolActivityExecution {
  return {
    workflowId: `workflow-${crypto.randomUUID()}`,
    runId: crypto.randomUUID(),
    activityId: "3",
  };
}

describe("tool activity start marker", () => {
  it("refuses the never-started claim once the activity claimed its start", async () => {
    const execution = makeExecution();

    expect(await claimToolActivityStart(execution)).toBe(true);
    expect(await claimToolActivityStart(execution)).toBe(true);
    expect(await claimToolActivityNeverStarted(execution)).toBe(false);
  });

  it("refuses the start claim once the workflow claimed the activity never started", async () => {
    const execution = makeExecution();

    expect(await claimToolActivityNeverStarted(execution)).toBe(true);
    expect(await claimToolActivityNeverStarted(execution)).toBe(true);
    expect(await claimToolActivityStart(execution)).toBe(false);
  });

  it("scopes claims to a single activity execution", async () => {
    const execution = makeExecution();

    expect(await claimToolActivityNeverStarted(execution)).toBe(true);
    expect(
      await claimToolActivityStart({ ...execution, activityId: "4" })
    ).toBe(true);
  });
});
