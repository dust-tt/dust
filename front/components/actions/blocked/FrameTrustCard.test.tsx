import { useFrameTrustGate } from "@app/components/actions/blocked/FrameTrustCard";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("useFrameTrustGate", () => {
  it("releases every held call with the viewer's decision", async () => {
    const { result } = renderHook(() => useFrameTrustGate());

    let first: Promise<boolean> = Promise.resolve(false);
    let second: Promise<boolean> = Promise.resolve(false);
    act(() => {
      first = result.current.requestTrust();
      second = result.current.requestTrust();
    });
    expect(result.current.isTrustRequested).toBe(true);

    act(() => result.current.settleTrust(true));

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(result.current.isTrustRequested).toBe(false);
  });

  it("refuses later calls without asking again after a decline", async () => {
    const { result } = renderHook(() => useFrameTrustGate());

    let held: Promise<boolean> = Promise.resolve(true);
    act(() => {
      held = result.current.requestTrust();
    });
    act(() => result.current.settleTrust(false));
    await expect(held).resolves.toBe(false);

    let later: Promise<boolean> = Promise.resolve(true);
    act(() => {
      later = result.current.requestTrust();
    });

    await expect(later).resolves.toBe(false);
    expect(result.current.isTrustRequested).toBe(false);
  });
});
