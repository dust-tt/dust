import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUserAnswerCollapse } from "./useUserAnswerCollapse";

function renderCollapse({
  questionId = "action_1",
  bottomOffset = 0,
}: {
  questionId?: string | null;
  bottomOffset?: number;
} = {}) {
  return renderHook(
    (props: { questionId: string | null; bottomOffset: number }) =>
      useUserAnswerCollapse(props),
    { initialProps: { questionId, bottomOffset } }
  );
}

describe("useUserAnswerCollapse", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts expanded at the bottom of the conversation", () => {
    const { result } = renderCollapse();

    expect(result.current.isCollapsed).toBe(false);
  });

  it("collapses when scrolling away from the bottom and expands when coming back", () => {
    const { result, rerender } = renderCollapse();

    rerender({ questionId: "action_1", bottomOffset: 400 });
    expect(result.current.isCollapsed).toBe(true);

    // Still far from the bottom: stays collapsed.
    rerender({ questionId: "action_1", bottomOffset: 60 });
    expect(result.current.isCollapsed).toBe(true);

    rerender({ questionId: "action_1", bottomOffset: 0 });
    expect(result.current.isCollapsed).toBe(false);
  });

  it("does not collapse for small scroll offsets near the bottom", () => {
    const { result, rerender } = renderCollapse();

    rerender({ questionId: "action_1", bottomOffset: 60 });

    expect(result.current.isCollapsed).toBe(false);
  });

  it("lets the manual toggle override the scroll position until the next transition", () => {
    const { result, rerender } = renderCollapse();

    act(() => result.current.toggleCollapsed());
    expect(result.current.isCollapsed).toBe(true);

    // Re-rendering at the bottom is not a transition: the manual choice sticks.
    vi.advanceTimersByTime(1_000);
    rerender({ questionId: "action_1", bottomOffset: 0 });
    expect(result.current.isCollapsed).toBe(true);

    // Scrolling away then back to the bottom expands it again.
    rerender({ questionId: "action_1", bottomOffset: 400 });
    expect(result.current.isCollapsed).toBe(true);
    rerender({ questionId: "action_1", bottomOffset: 0 });
    expect(result.current.isCollapsed).toBe(false);

    // Expanding manually while scrolled away sticks until the bottom is reached.
    rerender({ questionId: "action_1", bottomOffset: 400 });
    act(() => result.current.toggleCollapsed());
    vi.advanceTimersByTime(1_000);
    rerender({ questionId: "action_1", bottomOffset: 600 });
    expect(result.current.isCollapsed).toBe(false);
  });

  it("ignores the scroll location shift caused by toggling", () => {
    const { result, rerender } = renderCollapse();

    // Expanding the card shrinks the viewport, which reads as a large offset.
    act(() => result.current.toggleCollapsed());
    rerender({ questionId: "action_1", bottomOffset: 250 });
    expect(result.current.isCollapsed).toBe(true);

    act(() => result.current.toggleCollapsed());
    rerender({ questionId: "action_1", bottomOffset: 250 });
    expect(result.current.isCollapsed).toBe(false);

    // Once the grace window is over, real scrolling takes effect again.
    vi.advanceTimersByTime(1_000);
    rerender({ questionId: "action_1", bottomOffset: 300 });
    expect(result.current.isCollapsed).toBe(true);
  });

  it("forgets the manual collapse when a different question takes over", () => {
    const { result, rerender } = renderCollapse();

    act(() => result.current.toggleCollapsed());
    expect(result.current.isCollapsed).toBe(true);

    rerender({ questionId: "action_2", bottomOffset: 0 });
    expect(result.current.isCollapsed).toBe(false);
  });

  it("collapses a new question right away when the reader is scrolled up", () => {
    const { result, rerender } = renderCollapse();

    rerender({ questionId: "action_1", bottomOffset: 400 });
    act(() => result.current.toggleCollapsed());
    expect(result.current.isCollapsed).toBe(false);

    vi.advanceTimersByTime(1_000);
    rerender({ questionId: "action_2", bottomOffset: 400 });
    expect(result.current.isCollapsed).toBe(true);
  });

  it("stays expanded while no question is shown", () => {
    const { result, rerender } = renderCollapse({ questionId: null });

    rerender({ questionId: null, bottomOffset: 400 });

    expect(result.current.isCollapsed).toBe(false);
  });
});
