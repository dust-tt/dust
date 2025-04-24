import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import logger from "@app/logger/logger";

import { getRedisClient } from "./api/redis";
import { Lock } from "./lock";

// Mock dependencies
vi.mock("./api/redis", () => ({
  getRedisClient: vi.fn(),
}));

vi.mock("@app/logger/logger", () => {
  // Create mock functions for all logger methods
  const mockLogger = {
    warn: vi.fn(),
    child: vi.fn(),
  };

  // Make child return a new logger instance with the same mock methods
  mockLogger.child.mockImplementation(() => mockLogger);

  // Return the mock as the default export
  return {
    default: mockLogger,
  };
});

const LOCK_VALUE_REGEX = /^\d+-.+$/;

describe("Lock", () => {
  let mockRedisClient: {
    set: ReturnType<typeof vi.fn>;
    eval: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup Redis client mock
    mockRedisClient = {
      set: vi.fn(),
      eval: vi.fn(),
    };
    (getRedisClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockRedisClient
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("should acquire lock, execute callback, and release lock", async () => {
    // Mock successful lock acquisition
    mockRedisClient.set.mockResolvedValue(true);
    // Mock successful lock release
    mockRedisClient.eval.mockResolvedValue(1);

    const callback = vi.fn().mockResolvedValue("result");

    const result = await Lock.executeWithLock("test-lock", callback);

    // Verify lock acquisition
    expect(getRedisClient).toHaveBeenCalledWith({ origin: "lock" });
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      "lock:test-lock",
      expect.stringMatching(LOCK_VALUE_REGEX),
      { NX: true, PX: 30000 }
    );

    // Verify callback execution
    expect(callback).toHaveBeenCalledTimes(1);

    // Verify lock release
    expect(mockRedisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining('if redis.call("get", KEYS[1]) == ARGV[1]'),
      {
        keys: ["lock:test-lock"],
        arguments: [expect.stringMatching(LOCK_VALUE_REGEX)],
      }
    );

    // Verify result
    expect(result).toBe("result");
  });

  test("should throw error when lock acquisition times out", async () => {
    // Reset Date.now mock
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(1000) // Initial call
      .mockReturnValueOnce(1000) // During lock acquisition
      .mockReturnValueOnce(31001); // After timeout period

    // Mock failed lock acquisition
    mockRedisClient.set.mockResolvedValue(false);

    const callback = vi.fn().mockResolvedValue("result");

    // Use a small timeout to speed up the test
    await expect(
      Lock.executeWithLock("test-lock", callback, {
        timeoutMs: 30000,
        initialRetryDelayMs: 10, // Small initial delay for faster test
      })
    ).rejects.toThrow("Lock acquisition timed out for test-lock");

    // Verify callback was never executed
    expect(callback).not.toHaveBeenCalled();
  });

  test("should extend lock for long-running operations", async () => {
    // Setup fake timers
    vi.useFakeTimers();

    // Mock successful lock acquisition
    mockRedisClient.set.mockResolvedValue(true);
    // Mock successful lock extension
    mockRedisClient.eval.mockResolvedValue(1);

    // Create a callback that will take some time to complete
    const callback = vi.fn().mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 15000);
      });
      return "result";
    });

    // Start the lock operation
    const lockPromise = Lock.executeWithLock("test-lock", callback, {
      timeoutMs: 30000,
      enableLockExtension: true,
    });

    // Fast-forward time to trigger lock extension (30000/3 = 10000ms)
    await vi.advanceTimersByTimeAsync(10000);

    // Allow any pending promises to resolve
    await vi.runAllTimersAsync();

    // Verify lock extension was attempted
    expect(mockRedisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining('if redis.call("get", KEYS[1]) == ARGV[1]'),
      {
        keys: ["lock:test-lock"],
        arguments: [expect.stringMatching(LOCK_VALUE_REGEX), "30000"],
      }
    );

    // Complete the operation
    const result = await lockPromise;

    // Verify result
    expect(result).toBe("result");

    // Verify lock was released
    expect(mockRedisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining('return redis.call("del", KEYS[1])'),
      expect.any(Object)
    );

    // Restore real timers
    vi.useRealTimers();
  });

  test("should bypass lock when __dangerouslySkipLock is true", async () => {
    const callback = vi.fn().mockResolvedValue("result");

    const result = await Lock.executeWithLock("test-lock", callback, {
      __dangerouslySkipLock: true,
    });

    // Verify Redis client was not used
    expect(getRedisClient).not.toHaveBeenCalled();
    expect(mockRedisClient.set).not.toHaveBeenCalled();
    expect(mockRedisClient.eval).not.toHaveBeenCalled();

    // Verify callback was executed
    expect(callback).toHaveBeenCalledTimes(1);

    // Verify warning was logged
    expect(logger.warn).toHaveBeenCalledWith(
      { lockName: "test-lock", bypass: true },
      "Bypassing lock: test-lock"
    );

    // Verify result
    expect(result).toBe("result");
  });

  test("should release lock when callback throws an error", async () => {
    // Mock successful lock acquisition
    mockRedisClient.set.mockResolvedValue(true);
    // Mock successful lock release
    mockRedisClient.eval.mockResolvedValue(1);

    const testError = new Error("Test error");
    const callback = vi.fn().mockRejectedValue(testError);

    // Execute with lock and expect error
    await expect(Lock.executeWithLock("test-lock", callback)).rejects.toThrow(
      testError
    );

    // Verify lock acquisition
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      "lock:test-lock",
      expect.stringMatching(LOCK_VALUE_REGEX), // timestamp-uuid
      { NX: true, PX: 30000 }
    );

    // Verify callback was executed
    expect(callback).toHaveBeenCalledTimes(1);

    // Verify lock release was attempted
    expect(mockRedisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining('if redis.call("get", KEYS[1]) == ARGV[1]'),
      {
        keys: ["lock:test-lock"],
        arguments: [expect.stringMatching(LOCK_VALUE_REGEX)],
      }
    );
  });
});
