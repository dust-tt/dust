import {
  DocumentStatusIcon,
  SAVING_DISPLAY_DELAY_MS,
} from "@app/components/editor/document/DocumentSaveStatus";
import type { CollabStatus } from "@app/components/editor/document/types";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const icon = (status: CollabStatus, syncing: boolean) => (
  <DocumentStatusIcon live={{ status, syncing }} />
);

const shownState = () => screen.getByRole("status").getAttribute("data-state");

describe("DocumentStatusIcon", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows saving once changes have waited the delay, and saved as soon as they sync", () => {
    const { rerender } = render(icon("live", false));
    expect(shownState()).toBe("saved");

    rerender(icon("live", true));
    act(() => vi.advanceTimersByTime(SAVING_DISPLAY_DELAY_MS - 1));
    expect(shownState()).toBe("saved");

    act(() => vi.advanceTimersByTime(1));
    expect(shownState()).toBe("saving");

    rerender(icon("live", false));
    expect(shownState()).toBe("saved");
  });

  it("stays saved while each change syncs within the delay", () => {
    const { rerender } = render(icon("live", false));

    for (let keystroke = 0; keystroke < 5; keystroke++) {
      rerender(icon("live", true));
      act(() => vi.advanceTimersByTime(SAVING_DISPLAY_DELAY_MS / 2));
      expect(shownState()).toBe("saved");
      rerender(icon("live", false));
      act(() => vi.advanceTimersByTime(SAVING_DISPLAY_DELAY_MS / 2));
    }
    expect(shownState()).toBe("saved");
  });

  it("waits the delay again for the changes after a slow sync", () => {
    const { rerender } = render(icon("live", true));
    act(() => vi.advanceTimersByTime(SAVING_DISPLAY_DELAY_MS));
    expect(shownState()).toBe("saving");
    rerender(icon("live", false));

    for (let keystroke = 0; keystroke < 5; keystroke++) {
      rerender(icon("live", true));
      expect(shownState()).toBe("saved");
      act(() => vi.advanceTimersByTime(SAVING_DISPLAY_DELAY_MS / 2));
      rerender(icon("live", false));
    }
    expect(shownState()).toBe("saved");
  });

  it("shows connecting and a lost session at once", () => {
    const { rerender } = render(icon("connecting", false));
    expect(shownState()).toBe("saving");

    rerender(icon("offline", true));
    expect(shownState()).toBe("disconnected");
  });
});
