import { executeWithLock, LockAcquisitionTimeoutError } from "@app/lib/lock";
import { describe, expect, it, vi } from "vitest";

describe("executeWithLock", () => {
  it("throws a typed error when lock acquisition times out", async () => {
    const callback = vi.fn();

    await expect(
      executeWithLock("test-lock", callback, 0)
    ).rejects.toBeInstanceOf(LockAcquisitionTimeoutError);
    expect(callback).not.toHaveBeenCalled();
  });
});
