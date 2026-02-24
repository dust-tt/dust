import logger from "@app/logger/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/logger/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

// Import actual cache module to bypass the global mock in vite.setup.ts
vi.mock("@app/lib/utils/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/utils/cache")>();
  return actual;
});

import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";

describe("invalidateCacheAfterCommit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls invalidateFn immediately when no transaction provided", async () => {
    const invalidateFn = vi.fn().mockResolvedValue(undefined);

    invalidateCacheAfterCommit(undefined, invalidateFn);

    // Wait for the promise to resolve
    await new Promise((resolve) => setImmediate(resolve));

    expect(invalidateFn).toHaveBeenCalledOnce();
  });

  it("defers invalidateFn until transaction commits", async () => {
    const invalidateFn = vi.fn().mockResolvedValue(undefined);
    const afterCommitCallbacks: (() => void)[] = [];

    const mockTransaction = {
      afterCommit: vi.fn((cb: () => void) => {
        afterCommitCallbacks.push(cb);
      }),
    };

    invalidateCacheAfterCommit(
      mockTransaction as unknown as Parameters<
        typeof invalidateCacheAfterCommit
      >[0],
      invalidateFn
    );

    // invalidateFn should not be called yet
    expect(invalidateFn).not.toHaveBeenCalled();
    expect(mockTransaction.afterCommit).toHaveBeenCalledOnce();

    // Simulate transaction commit
    afterCommitCallbacks.forEach((cb) => cb());

    // Wait for the promise to resolve
    await new Promise((resolve) => setImmediate(resolve));

    expect(invalidateFn).toHaveBeenCalledOnce();
  });

  it("logs error with panic: true when invalidateFn fails without transaction", async () => {
    const testError = new Error("Cache invalidation failed");
    const invalidateFn = vi.fn().mockRejectedValue(testError);

    invalidateCacheAfterCommit(undefined, invalidateFn);

    // Wait for the promise to reject and be caught
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalledWith(
      { panic: true, err: testError },
      "Failed to invalidate cache after transaction commit"
    );
  });

  it("logs error with panic: true when invalidateFn fails after transaction commit", async () => {
    const testError = new Error("Cache invalidation failed");
    const invalidateFn = vi.fn().mockRejectedValue(testError);
    const afterCommitCallbacks: (() => void)[] = [];

    const mockTransaction = {
      afterCommit: vi.fn((cb: () => void) => {
        afterCommitCallbacks.push(cb);
      }),
    };

    invalidateCacheAfterCommit(
      mockTransaction as unknown as Parameters<
        typeof invalidateCacheAfterCommit
      >[0],
      invalidateFn
    );

    // Simulate transaction commit
    afterCommitCallbacks.forEach((cb) => cb());

    // Wait for the promise to reject and be caught
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalledWith(
      { panic: true, err: testError },
      "Failed to invalidate cache after transaction commit"
    );
  });
});
