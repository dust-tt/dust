import type { PlanUpdatedDeps } from "@app/components/assistant/conversation/plan_mode/handle_plan_updated";
import { handlePlanUpdatedEvent } from "@app/components/assistant/conversation/plan_mode/handle_plan_updated";
import type { PlanUpdatedEvent } from "@app/types/assistant/conversation";
import { describe, expect, it, vi } from "vitest";

function makeEvent(isClosed: boolean): PlanUpdatedEvent {
  return {
    type: "plan_updated",
    created: 0,
    conversationId: "c_test",
    isClosed,
  };
}

function makeDeps(overrides: Partial<PlanUpdatedDeps> = {}): PlanUpdatedDeps {
  return {
    writeClosedToCache: vi.fn(),
    revalidatePlan: vi.fn(),
    ...overrides,
  };
}

describe("handlePlanUpdatedEvent", () => {
  it("on close, drops the cache to null and does not revalidate", () => {
    const deps = makeDeps();

    handlePlanUpdatedEvent(makeEvent(true), deps);

    expect(deps.writeClosedToCache).toHaveBeenCalledTimes(1);
    expect(deps.revalidatePlan).not.toHaveBeenCalled();
  });

  it("on create/edit, revalidates the plan and does not touch the cache", () => {
    const deps = makeDeps();

    handlePlanUpdatedEvent(makeEvent(false), deps);

    expect(deps.revalidatePlan).toHaveBeenCalledTimes(1);
    expect(deps.writeClosedToCache).not.toHaveBeenCalled();
  });
});
