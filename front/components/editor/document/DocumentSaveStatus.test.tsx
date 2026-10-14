import {
  SAVING_DISPLAY_DELAY_MS,
  useShowSaving,
} from "@app/components/editor/document/DocumentSaveStatus";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const renderShowSaving = () =>
  renderHook<boolean, { syncingSinceMs: number | null }>(
    ({ syncingSinceMs }) => useShowSaving(syncingSinceMs),
    { initialProps: { syncingSinceMs: null } }
  );

describe("useShowSaving", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows saving once changes have waited the delay, and stops as soon as they sync", () => {
    const { result, rerender } = renderShowSaving();
    expect(result.current).toBe(false);

    rerender({ syncingSinceMs: 1 });
    act(() => vi.advanceTimersByTime(SAVING_DISPLAY_DELAY_MS - 1));
    expect(result.current).toBe(false);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);

    rerender({ syncingSinceMs: null });
    expect(result.current).toBe(false);
  });

  it("does not show changes that sync within the delay", () => {
    const { result, rerender } = renderShowSaving();

    for (let keystroke = 1; keystroke <= 5; keystroke++) {
      rerender({ syncingSinceMs: keystroke });
      act(() => vi.advanceTimersByTime(SAVING_DISPLAY_DELAY_MS / 2));
      expect(result.current).toBe(false);
      rerender({ syncingSinceMs: null });
      act(() => vi.advanceTimersByTime(SAVING_DISPLAY_DELAY_MS / 2));
    }
    expect(result.current).toBe(false);
  });

  it("waits the delay again for the changes after a slow sync", () => {
    const { result, rerender } = renderShowSaving();
    rerender({ syncingSinceMs: 1 });
    act(() => vi.advanceTimersByTime(SAVING_DISPLAY_DELAY_MS));
    expect(result.current).toBe(true);
    rerender({ syncingSinceMs: null });

    for (let keystroke = 2; keystroke <= 6; keystroke++) {
      rerender({ syncingSinceMs: keystroke });
      expect(result.current).toBe(false);
      act(() => vi.advanceTimersByTime(SAVING_DISPLAY_DELAY_MS / 2));
      rerender({ syncingSinceMs: null });
    }
    expect(result.current).toBe(false);
  });
});
