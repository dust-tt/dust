import { usePrewarmFrameSandbox } from "@app/hooks/usePrewarmFrameSandbox";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ clientFetch: vi.fn() }));

vi.mock("@app/lib/egress/client", () => ({
  clientFetch: mocks.clientFetch,
}));

describe("usePrewarmFrameSandbox", () => {
  beforeEach(() => {
    mocks.clientFetch.mockReset();
    mocks.clientFetch.mockResolvedValue(new Response(null, { status: 202 }));
  });

  it("asks the server once to pre-warm the Frame's sandbox", () => {
    const { rerender } = renderHook(() =>
      usePrewarmFrameSandbox({
        workspaceId: "w_current",
        frameId: "fil_frame",
        disabled: false,
      })
    );
    rerender();

    expect(mocks.clientFetch).toHaveBeenCalledExactlyOnceWith(
      "/api/w/w_current/frames/fil_frame/prewarm",
      { method: "POST" }
    );
  });

  it("does nothing when disabled or without a Frame v2", () => {
    renderHook(() =>
      usePrewarmFrameSandbox({
        workspaceId: "w_current",
        frameId: "fil_frame",
        disabled: true,
      })
    );
    renderHook(() =>
      usePrewarmFrameSandbox({
        workspaceId: "w_current",
        frameId: undefined,
        disabled: false,
      })
    );

    expect(mocks.clientFetch).not.toHaveBeenCalled();
  });
});
