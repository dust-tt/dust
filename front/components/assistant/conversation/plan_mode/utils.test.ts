import { planPanelDecision } from "@app/components/assistant/conversation/plan_mode/utils";
import { describe, expect, it } from "vitest";

const base = {
  isLoading: false,
  hasContent: false,
  isMobile: false,
  isPanelOpen: false,
  prev: "unknown" as const,
};

describe("planPanelDecision", () => {
  it("does nothing while the plan is still loading", () => {
    expect(
      planPanelDecision({ ...base, isLoading: true, prev: "empty" })
    ).toEqual({ next: "empty", action: null });
  });

  it("settles to empty (no action) when loaded without a plan", () => {
    expect(planPanelDecision(base)).toEqual({ next: "empty", action: null });
  });

  it("opens once on the empty -> present transition (creation)", () => {
    expect(
      planPanelDecision({ ...base, hasContent: true, prev: "empty" })
    ).toEqual({ next: "present", action: "open" });
  });

  it("does not reopen on an edit (present -> present)", () => {
    expect(
      planPanelDecision({ ...base, hasContent: true, prev: "present" })
    ).toEqual({ next: "present", action: null });
  });

  it("does not open a plan already present on load (unknown -> present)", () => {
    expect(planPanelDecision({ ...base, hasContent: true })).toEqual({
      next: "present",
      action: null,
    });
  });

  it("does not auto-open on mobile", () => {
    expect(
      planPanelDecision({
        ...base,
        hasContent: true,
        prev: "empty",
        isMobile: true,
      })
    ).toEqual({ next: "present", action: null });
  });

  it("closes the panel on the present -> empty transition (close)", () => {
    expect(
      planPanelDecision({ ...base, prev: "present", isPanelOpen: true })
    ).toEqual({ next: "empty", action: "close" });
  });

  it("does not close when the plan panel is not the open one", () => {
    expect(
      planPanelDecision({ ...base, prev: "present", isPanelOpen: false })
    ).toEqual({ next: "empty", action: null });
  });

  it("still closes on mobile (panel would otherwise show an empty plan)", () => {
    expect(
      planPanelDecision({
        ...base,
        prev: "present",
        isPanelOpen: true,
        isMobile: true,
      })
    ).toEqual({ next: "empty", action: "close" });
  });

  it("re-opens after a close -> recreate cycle", () => {
    // Create + open.
    let state = planPanelDecision({ ...base, hasContent: true, prev: "empty" });
    expect(state).toEqual({ next: "present", action: "open" });

    // Close (panel open) -> close.
    state = planPanelDecision({
      ...base,
      hasContent: false,
      isPanelOpen: true,
      prev: state.next,
    });
    expect(state).toEqual({ next: "empty", action: "close" });

    // Recreate -> open again.
    state = planPanelDecision({ ...base, hasContent: true, prev: state.next });
    expect(state).toEqual({ next: "present", action: "open" });
  });
});
