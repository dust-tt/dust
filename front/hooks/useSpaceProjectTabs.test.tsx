import {
  DEFAULT_POD_UI_PREFERENCES,
  usePodTabs,
} from "@app/hooks/useSpaceProjectTabs";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => window.history.replaceState(null, "", "/#conversations"));

describe("Pod tab persistence", () => {
  it("waits for the document save before changing tabs or the URL", async () => {
    const save = Promise.withResolvers<boolean>();
    const setPodUiPreferences = vi.fn();
    const { result } = renderHook(() =>
      usePodTabs({
        podId: "pod-abc",
        podUiPreferences: DEFAULT_POD_UI_PREFERENCES,
        setPodUiPreferences,
      })
    );
    result.current.registerBeforeChange(() => save.promise);

    act(() => result.current.handleTabChange("files"));
    expect(setPodUiPreferences).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#conversations");

    await act(async () => save.resolve(true));
    expect(setPodUiPreferences).toHaveBeenCalledWith({
      ...DEFAULT_POD_UI_PREFERENCES,
      tab: "files",
    });
    expect(window.location.hash).toBe("#files");
  });

  it("keeps the current tab after a failed save and allows a later retry", async () => {
    const save = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
    const setPodUiPreferences = vi.fn();
    const { result } = renderHook(() =>
      usePodTabs({
        podId: "pod-abc",
        podUiPreferences: DEFAULT_POD_UI_PREFERENCES,
        setPodUiPreferences,
      })
    );
    result.current.registerBeforeChange(save);

    await act(async () => result.current.handleTabChange("files"));
    expect(setPodUiPreferences).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#conversations");

    save.mockResolvedValue(true);
    await act(async () => result.current.handleTabChange("files"));
    expect(setPodUiPreferences).toHaveBeenCalledWith({
      ...DEFAULT_POD_UI_PREFERENCES,
      tab: "files",
    });
  });
});
