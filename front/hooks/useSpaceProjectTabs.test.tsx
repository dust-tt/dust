import {
  DEFAULT_POD_UI_PREFERENCES,
  usePodTabs,
} from "@app/hooks/useSpaceProjectTabs";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => window.history.replaceState(null, "", "/#conversations"));

describe("Pod tab persistence", () => {
  it("blocks tab changes while locked without queuing navigation", () => {
    const setPodUiPreferences = vi.fn();
    const { result } = renderHook(() =>
      usePodTabs({
        podId: "pod-abc",
        podUiPreferences: DEFAULT_POD_UI_PREFERENCES,
        setPodUiPreferences,
      })
    );
    const unlock = result.current.lockViewChange();

    act(() => result.current.handleTabChange("files"));
    expect(setPodUiPreferences).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#conversations");

    unlock();
    expect(setPodUiPreferences).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#conversations");

    act(() => result.current.handleTabChange("files"));
    expect(setPodUiPreferences).toHaveBeenCalledWith({
      ...DEFAULT_POD_UI_PREFERENCES,
      tab: "files",
    });
    expect(window.location.hash).toBe("#files");
  });

  it("changes a clean tab immediately", () => {
    const setPodUiPreferences = vi.fn();
    const { result } = renderHook(() =>
      usePodTabs({
        podId: "pod-abc",
        podUiPreferences: DEFAULT_POD_UI_PREFERENCES,
        setPodUiPreferences,
      })
    );
    act(() => result.current.handleTabChange("files"));
    expect(setPodUiPreferences).toHaveBeenCalledWith({
      ...DEFAULT_POD_UI_PREFERENCES,
      tab: "files",
    });
  });
});
