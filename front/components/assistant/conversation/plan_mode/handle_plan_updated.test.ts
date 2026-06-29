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
    isMobile: false,
    isPlanPanelOpen: false,
    autoOpenedRef: { current: false },
    writeClosedToCache: vi.fn(),
    revalidate: vi.fn().mockResolvedValue({ content: "# Plan" }),
    openPlanPanel: vi.fn(),
    closePanel: vi.fn(),
    ...overrides,
  };
}

describe("handlePlanUpdatedEvent", () => {
  it("on close, drops the cache, closes the plan panel, and re-arms auto-open", async () => {
    const deps = makeDeps({
      isPlanPanelOpen: true,
      autoOpenedRef: { current: true },
    });

    await handlePlanUpdatedEvent(makeEvent(true), deps);

    expect(deps.writeClosedToCache).toHaveBeenCalledTimes(1);
    expect(deps.closePanel).toHaveBeenCalledTimes(1);
    expect(deps.autoOpenedRef.current).toBe(false);
    expect(deps.revalidate).not.toHaveBeenCalled();
    expect(deps.openPlanPanel).not.toHaveBeenCalled();
  });

  it("on close, leaves the panel alone when the plan panel is not open", async () => {
    const deps = makeDeps({ isPlanPanelOpen: false });

    await handlePlanUpdatedEvent(makeEvent(true), deps);

    expect(deps.writeClosedToCache).toHaveBeenCalledTimes(1);
    expect(deps.closePanel).not.toHaveBeenCalled();
  });

  it("on create, revalidates and opens the plan panel once content arrives", async () => {
    const deps = makeDeps();

    await handlePlanUpdatedEvent(makeEvent(false), deps);

    expect(deps.revalidate).toHaveBeenCalledTimes(1);
    expect(deps.openPlanPanel).toHaveBeenCalledTimes(1);
    expect(deps.autoOpenedRef.current).toBe(true);
  });

  it("on edit (already auto-opened), refreshes but does not reopen the panel", async () => {
    const deps = makeDeps({ autoOpenedRef: { current: true } });

    await handlePlanUpdatedEvent(makeEvent(false), deps);

    expect(deps.revalidate).toHaveBeenCalledTimes(1);
    expect(deps.openPlanPanel).not.toHaveBeenCalled();
    expect(deps.autoOpenedRef.current).toBe(true);
  });

  it("on create, does not auto-open on mobile", async () => {
    const deps = makeDeps({ isMobile: true });

    await handlePlanUpdatedEvent(makeEvent(false), deps);

    expect(deps.openPlanPanel).not.toHaveBeenCalled();
    expect(deps.autoOpenedRef.current).toBe(false);
  });

  it("on create, releases the latch when the fetch returns no content", async () => {
    const deps = makeDeps({
      revalidate: vi.fn().mockResolvedValue({ content: null }),
    });

    await handlePlanUpdatedEvent(makeEvent(false), deps);

    expect(deps.openPlanPanel).not.toHaveBeenCalled();
    expect(deps.autoOpenedRef.current).toBe(false);
  });

  it("on create, does not reopen when a close reset the latch mid-revalidation", async () => {
    const autoOpenedRef = { current: false };
    const deps = makeDeps({
      autoOpenedRef,
      // Simulate a close event landing (resetting the latch) while the revalidation is in flight,
      // then this stale revalidation resolving with content.
      revalidate: vi.fn().mockImplementation(async () => {
        autoOpenedRef.current = false;
        return { content: "# Plan" };
      }),
    });

    await handlePlanUpdatedEvent(makeEvent(false), deps);

    expect(deps.openPlanPanel).not.toHaveBeenCalled();
  });

  it("on create, releases the latch when the fetch fails", async () => {
    const deps = makeDeps({
      revalidate: vi.fn().mockRejectedValue(new Error("boom")),
    });

    await handlePlanUpdatedEvent(makeEvent(false), deps);

    expect(deps.openPlanPanel).not.toHaveBeenCalled();
    expect(deps.autoOpenedRef.current).toBe(false);
  });
});
