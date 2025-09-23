import { describe, expect, it, vi } from "vitest";

import { throttle } from "./throttle";

describe("throttle", () => {
  // Helper function to create mock functions for testing
  const createMockFunctions = (initialTimestamps: number[] = []) => {
    const timestamps = [...initialTimestamps];
    const removedTimestamps: number[] = [];

    const getTimestamps = vi.fn(async () => [...timestamps]);
    const addTimestamp = vi.fn(async (timestamp: number) => {
      timestamps.push(timestamp);
    });
    const removeTimestamp = vi.fn(async (timestamp: number) => {
      const index = timestamps.indexOf(timestamp);
      if (index > -1) {
        timestamps.splice(index, 1);
        removedTimestamps.push(timestamp);
      }
    });

    return {
      getTimestamps,
      addTimestamp,
      removeTimestamp,
      getCurrentTimestamps: () => [...timestamps],
      getRemovedTimestamps: () => [...removedTimestamps],
    };
  };

  describe("basic functionality", () => {
    it("should allow request when under rate limit", async () => {
      const mocks = createMockFunctions();
      const now = Date.now();

      const result = await throttle({
        rateLimitPerMinute: 100,
        canBeIgnored: false,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      expect(result).toEqual({ delay: 0, skip: false });
      expect(mocks.getTimestamps).toHaveBeenCalledOnce();
      expect(mocks.addTimestamp).toHaveBeenCalledWith(now);
      expect(mocks.removeTimestamp).not.toHaveBeenCalled();
    });

    it("should allow request when exactly at rate limit", async () => {
      const now = Date.now();
      // For rate limit of 100, create 99 existing timestamps
      const existingTimestamps = Array.from(
        { length: 99 },
        (_, i) => now - i * 1000
      );
      const mocks = createMockFunctions(existingTimestamps);

      const result = await throttle({
        rateLimitPerMinute: 100,
        canBeIgnored: false,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      expect(result).toEqual({ delay: 0, skip: false });
      expect(mocks.addTimestamp).toHaveBeenCalledWith(now);
    });

    it("should throttle request when over rate limit", async () => {
      const now = Date.now();
      // For rate limit of 100, create 100 existing timestamps within the last minute
      const existingTimestamps = Array.from(
        { length: 100 },
        (_, i) => now - i * 500
      ); // 500ms apart to stay within 1 minute
      const mocks = createMockFunctions(existingTimestamps);

      const result = await throttle({
        rateLimitPerMinute: 100,
        canBeIgnored: false,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      expect(result.delay).toBeGreaterThan(0);
      expect(result.skip).toBe(false);
      // Should add future timestamp
      expect(mocks.addTimestamp).toHaveBeenCalled();
      const addedTimestamp = mocks.addTimestamp.mock.calls[0]?.[0];
      expect(addedTimestamp).toBeDefined();
      expect(addedTimestamp!).toBeGreaterThan(now);
    });
  });

  describe("rate limit enforcement", () => {
    it("should enforce rate limit correctly", async () => {
      const now = Date.now();

      // Test with different rate limits
      const testCases = [
        { rateLimitPerMinute: 100, expectedAllowed: 100 },
        { rateLimitPerMinute: 60, expectedAllowed: 60 },
        { rateLimitPerMinute: 10, expectedAllowed: 10 },
        { rateLimitPerMinute: 1, expectedAllowed: 1 },
      ];

      for (const { rateLimitPerMinute, expectedAllowed } of testCases) {
        // Create exactly the allowed number of timestamps to test the edge case
        const existingTimestamps = Array.from(
          { length: expectedAllowed },
          (_, i) => now - i * 500
        );
        const mocks = createMockFunctions(existingTimestamps);

        const result = await throttle({
          rateLimitPerMinute,
          canBeIgnored: false,
          now,
          getTimestamps: mocks.getTimestamps,
          addTimestamp: mocks.addTimestamp,
          removeTimestamp: mocks.removeTimestamp,
        });

        // When we have exactly the allowed number, adding one more should trigger throttling
        expect(result.delay).toBeGreaterThan(0);
        expect(result.skip).toBe(false);
      }
    });
  });

  describe("timestamp cleanup", () => {
    it("should remove expired timestamps older than 1 minute", async () => {
      const now = Date.now();

      const existingTimestamps = [
        now - 30 * 1000, // 30 seconds ago (valid)
        now - 45 * 1000, // 45 seconds ago (valid)
        now - 70 * 1000, // 70 seconds ago (expired)
        now - 90 * 1000, // 90 seconds ago (expired)
        now - 120 * 1000, // 2 minutes ago (expired)
      ];

      const mocks = createMockFunctions(existingTimestamps);

      await throttle({
        rateLimitPerMinute: 100,
        canBeIgnored: false,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      // Should remove the 3 expired timestamps
      expect(mocks.removeTimestamp).toHaveBeenCalledTimes(3);
      expect(mocks.removeTimestamp).toHaveBeenCalledWith(now - 70 * 1000);
      expect(mocks.removeTimestamp).toHaveBeenCalledWith(now - 90 * 1000);
      expect(mocks.removeTimestamp).toHaveBeenCalledWith(now - 120 * 1000);

      // Should not remove valid timestamps
      expect(mocks.removeTimestamp).not.toHaveBeenCalledWith(now - 30 * 1000);
      expect(mocks.removeTimestamp).not.toHaveBeenCalledWith(now - 45 * 1000);
    });

    it("should handle empty timestamp list", async () => {
      const mocks = createMockFunctions([]);
      const now = Date.now();

      const result = await throttle({
        rateLimitPerMinute: 100,
        canBeIgnored: false,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      expect(result).toEqual({ delay: 0, skip: false });
      expect(mocks.removeTimestamp).not.toHaveBeenCalled();
      expect(mocks.addTimestamp).toHaveBeenCalledWith(now);
    });
  });

  describe("canBeIgnored functionality", () => {
    it("should return skip=true when canBeIgnored is true and over limit", async () => {
      const now = Date.now();
      // Create 100 timestamps (at the rate limit for rate limit of 100) within the last minute
      const existingTimestamps = Array.from(
        { length: 100 },
        (_, i) => now - i * 500
      );
      const mocks = createMockFunctions(existingTimestamps);

      const result = await throttle({
        rateLimitPerMinute: 100,
        canBeIgnored: true,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      expect(result).toEqual({ delay: undefined, skip: true });
      // Should not add timestamp when ignoring
      expect(mocks.addTimestamp).not.toHaveBeenCalled();
    });

    it("should still allow request when canBeIgnored is true but under limit", async () => {
      const mocks = createMockFunctions([]);
      const now = Date.now();

      const result = await throttle({
        rateLimitPerMinute: 100,
        canBeIgnored: true,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      expect(result).toEqual({ delay: 0, skip: false });
      expect(mocks.addTimestamp).toHaveBeenCalledWith(now);
    });

    it("should calculate delay when canBeIgnored is false and over limit", async () => {
      const now = Date.now();
      // Create 100 timestamps (at the rate limit for rate limit of 100) within the last minute
      const existingTimestamps = Array.from(
        { length: 100 },
        (_, i) => now - i * 500
      );
      const mocks = createMockFunctions(existingTimestamps);

      const result = await throttle({
        rateLimitPerMinute: 100,
        canBeIgnored: false,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      expect(result.delay).toBeGreaterThan(0);
      expect(result.delay).toBeLessThanOrEqual(60 * 1000); // Should be within 1 minute
      expect(result.skip).toBe(false);
      expect(mocks.addTimestamp).toHaveBeenCalled();
    });
  });

  describe("delay calculation", () => {
    it("should calculate correct delay based on oldest timestamp in window", async () => {
      const now = Date.now();
      const oldestInWindow = now - 30 * 1000; // 30 seconds ago

      // Create exactly 100 timestamps (100% of 100), with the oldest being 30 seconds ago
      // Fill the rest with timestamps between oldestInWindow and now
      const existingTimestamps = [
        oldestInWindow,
        ...Array.from({ length: 99 }, (_, i) => oldestInWindow + (i + 1) * 300), // Spread evenly
      ];
      const mocks = createMockFunctions(existingTimestamps);

      const result = await throttle({
        rateLimitPerMinute: 100,
        canBeIgnored: false,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      // With the algorithm, we wait for the oldest timestamp to expire
      // Expected delay: (oldestInWindow + 60000) - now = 30 seconds
      const expectedDelay = oldestInWindow + 60 * 1000 - now;
      expect(result.delay).toBe(expectedDelay);
      expect(result.delay).toBe(30 * 1000);
      expect(result.skip).toBe(false);
    });

    it("should return 0 delay when calculated delay is negative", async () => {
      const now = Date.now();
      // Create a scenario where the calculated delay would be negative
      const oldestInWindow = now - 70 * 1000; // 70 seconds ago

      const existingTimestamps = [
        oldestInWindow,
        ...Array.from({ length: 99 }, (_, i) => now - i * 1000 - 1000),
      ];
      const mocks = createMockFunctions(existingTimestamps);

      const result = await throttle({
        rateLimitPerMinute: 100,
        canBeIgnored: false,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      // Math.max(0, delay) should ensure non-negative result
      expect(result.delay).toBe(0);
      expect(result.skip).toBe(false);
    });

    it("should add future timestamp when throttling", async () => {
      const now = Date.now();
      const oldestInWindow = now - 30 * 1000;

      const existingTimestamps = [
        oldestInWindow,
        ...Array.from({ length: 99 }, (_, i) => oldestInWindow + (i + 1) * 300),
      ];
      const mocks = createMockFunctions(existingTimestamps);

      await throttle({
        rateLimitPerMinute: 100,
        canBeIgnored: false,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      expect(mocks.addTimestamp).toHaveBeenCalledOnce();
      const addedTimestamp = mocks.addTimestamp.mock.calls[0]?.[0];
      expect(addedTimestamp).toBeDefined();
      // With the fixed algorithm, we add a timestamp when the oldest will expire
      const expectedFutureTimestamp = oldestInWindow + 60 * 1000;
      expect(addedTimestamp!).toBe(expectedFutureTimestamp);
    });
  });

  describe("edge cases", () => {
    it("should handle rate limit of 1", async () => {
      const mocks = createMockFunctions([]);
      const now = Date.now();

      const result = await throttle({
        rateLimitPerMinute: 1,
        canBeIgnored: false,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      expect(result).toEqual({ delay: 0, skip: false });
      expect(mocks.addTimestamp).toHaveBeenCalledWith(now);
    });

    it("should throttle when rate limit of 1 is exceeded", async () => {
      const now = Date.now();
      const existingTimestamps = [now - 30 * 1000]; // One timestamp from 30 seconds ago
      const mocks = createMockFunctions(existingTimestamps);

      const result = await throttle({
        rateLimitPerMinute: 1,
        canBeIgnored: false,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      expect(result.delay).toBeGreaterThan(0);
      expect(result.skip).toBe(false);
      expect(mocks.addTimestamp).toHaveBeenCalled();
    });

    it("should handle very high rate limits", async () => {
      const mocks = createMockFunctions([]);
      const now = Date.now();

      const result = await throttle({
        rateLimitPerMinute: 10000,
        canBeIgnored: false,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      expect(result).toEqual({ delay: 0, skip: false });
      expect(mocks.addTimestamp).toHaveBeenCalledWith(now);
    });

    it("should handle timestamps exactly at the 1-minute boundary", async () => {
      const now = Date.now();
      const exactlyOneMinuteAgo = now - 60 * 1000;
      const justOverOneMinuteAgo = now - 60 * 1000 - 1;
      const wayOverOneMinuteAgo = now - 120 * 1000;

      const existingTimestamps = [
        exactlyOneMinuteAgo, // Should be removed (exactly at boundary - condition is timestamp > oneMinuteAgo)
        justOverOneMinuteAgo, // Should be removed (just over boundary)
        wayOverOneMinuteAgo, // Should be removed (way over boundary)
      ];

      const mocks = createMockFunctions(existingTimestamps);

      await throttle({
        rateLimitPerMinute: 100,
        canBeIgnored: false,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      // All 3 timestamps should be removed because the condition is timestamp > oneMinuteAgo
      // This means timestamps exactly at the boundary (==) are also removed
      expect(mocks.removeTimestamp).toHaveBeenCalledTimes(3);
      expect(mocks.removeTimestamp).toHaveBeenCalledWith(exactlyOneMinuteAgo);
      expect(mocks.removeTimestamp).toHaveBeenCalledWith(justOverOneMinuteAgo);
      expect(mocks.removeTimestamp).toHaveBeenCalledWith(wayOverOneMinuteAgo);
    });

    it("should handle duplicate timestamps", async () => {
      const now = Date.now();
      const duplicateTimestamp = now - 30 * 1000;

      const existingTimestamps = [
        duplicateTimestamp,
        duplicateTimestamp,
        duplicateTimestamp,
      ];

      const mocks = createMockFunctions(existingTimestamps);

      const result = await throttle({
        rateLimitPerMinute: 100,
        canBeIgnored: false,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      expect(result).toEqual({ delay: 0, skip: false });
      expect(mocks.addTimestamp).toHaveBeenCalledWith(now);
      // No timestamps should be removed (all are within the window)
      expect(mocks.removeTimestamp).not.toHaveBeenCalled();
    });
  });

  describe("sliding window algorithm correctness", () => {
    it("should use correct timestamp when over capacity", async () => {
      const now = 60000;

      // Scenario: We have 11 timestamps but only allow 10 (100% of 10)
      // This can happen due to race conditions or cleanup delays
      const unsortedTimestamps = [
        50000,
        5000, // This is the oldest
        45000,
        10000,
        40000,
        15000,
        35000,
        20000,
        30000,
        25000,
        55000,
      ];

      const mocks = createMockFunctions(unsortedTimestamps);

      const result = await throttle({
        rateLimitPerMinute: 10, // 100% = 10 allowed
        canBeIgnored: false,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      // The algorithm should:
      // 1. Sort timestamps: [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 55000]
      // 2. Pick index [11 - 10] = [1] = 10000
      // 3. Calculate delay: (10000 + 60000) - 60000 = 10000ms

      const sortedTimestamps = [...unsortedTimestamps].sort((a, b) => a - b);
      const targetIndex = unsortedTimestamps.length - 10; // 11 - 10 = 1
      const targetTimestamp = sortedTimestamps[targetIndex]; // 10000
      const expectedDelay = targetTimestamp! + 60000 - now; // 10000

      expect(result.delay).toBe(expectedDelay);
      expect(result.delay).toBe(10000);
      expect(result.skip).toBe(false);

      // Verify the timestamp was used for scheduling
      expect(mocks.addTimestamp).toHaveBeenCalledWith(targetTimestamp! + 60000);
      expect(mocks.addTimestamp).toHaveBeenCalledWith(70000);
    });

    it("should handle exactly at capacity correctly", async () => {
      const now = 60000;

      // Scenario: We have exactly 10 timestamps (the allowed amount)
      const unsortedTimestamps = [
        45000, 10000, 50000, 15000, 40000, 20000, 35000, 25000, 30000, 5000,
      ];

      // When exactly at capacity, the algorithm picks sortedTimestamps[10-10] = sortedTimestamps[0] (the oldest)

      const mocks = createMockFunctions(unsortedTimestamps);

      const result = await throttle({
        rateLimitPerMinute: 10, // 100% = 10 allowed
        canBeIgnored: false,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      const sortedTimestamps = [...unsortedTimestamps].sort((a, b) => a - b);
      const oldestTimestamp = sortedTimestamps[0]; // 5000
      const expectedDelay = oldestTimestamp! + 60000 - now; // 5000

      expect(result.delay).toBe(expectedDelay);
      expect(result.delay).toBe(5000);
      expect(result.skip).toBe(false);
    });

    it("should handle unsorted timestamps correctly", async () => {
      const now = 60000;

      // Create timestamps in random order (as they might come from Redis)
      const unsortedTimestamps = [
        55000,
        45000,
        50000,
        10000,
        40000,
        15000, // This should be picked (sortedTimestamps[2])
        35000,
        20000,
        30000,
        25000,
        5000,
      ];

      const mocks = createMockFunctions(unsortedTimestamps);

      const result = await throttle({
        rateLimitPerMinute: 10,
        canBeIgnored: false,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      // Algorithm: sortedTimestamps[11-10] = sortedTimestamps[1] = 10000
      const sortedTimestamps = [...unsortedTimestamps].sort((a, b) => a - b);
      const targetTimestamp = sortedTimestamps[1]; // 10000
      const expectedDelay = targetTimestamp! + 60000 - now;

      expect(result.delay).toBe(expectedDelay);
      expect(result.delay).toBe(10000);
      expect(result.skip).toBe(false);
    });
  });

  describe("integration scenarios", () => {
    it("should handle mixed scenario with expired and valid timestamps", async () => {
      const now = Date.now();

      const existingTimestamps = [
        // Valid timestamps (within 1 minute)
        now - 10 * 1000, // 10 seconds ago
        now - 30 * 1000, // 30 seconds ago
        now - 50 * 1000, // 50 seconds ago
        // Expired timestamps (older than 1 minute)
        now - 70 * 1000, // 70 seconds ago
        now - 90 * 1000, // 90 seconds ago
        now - 120 * 1000, // 2 minutes ago
      ];

      const mocks = createMockFunctions(existingTimestamps);

      const result = await throttle({
        rateLimitPerMinute: 100,
        canBeIgnored: false,
        now,
        getTimestamps: mocks.getTimestamps,
        addTimestamp: mocks.addTimestamp,
        removeTimestamp: mocks.removeTimestamp,
      });

      // Should allow the request (3 valid + 1 new = 4, well under 100)
      expect(result).toEqual({ delay: 0, skip: false });

      // Should remove 3 expired timestamps
      expect(mocks.removeTimestamp).toHaveBeenCalledTimes(3);
      expect(mocks.removeTimestamp).toHaveBeenCalledWith(now - 70 * 1000);
      expect(mocks.removeTimestamp).toHaveBeenCalledWith(now - 90 * 1000);
      expect(mocks.removeTimestamp).toHaveBeenCalledWith(now - 120 * 1000);

      // Should add current timestamp
      expect(mocks.addTimestamp).toHaveBeenCalledWith(now);
    });

    it("should handle rapid successive calls simulation", async () => {
      const baseTime = Date.now();
      const timestamps: number[] = [];

      const mocks = {
        getTimestamps: vi.fn(async () => [...timestamps]),
        addTimestamp: vi.fn(async (timestamp: number) => {
          timestamps.push(timestamp);
        }),
        removeTimestamp: vi.fn(async (timestamp: number) => {
          const index = timestamps.indexOf(timestamp);
          if (index > -1) {
            timestamps.splice(index, 1);
          }
        }),
      };

      // Simulate 110 requests in quick succession
      const results: { delay: number | undefined; skip: boolean }[] = [];
      for (let i = 0; i < 110; i++) {
        const now = baseTime + i * 100; // 100ms apart

        const result = await throttle({
          rateLimitPerMinute: 100, // 100 allowed without safety margin
          canBeIgnored: false,
          now,
          getTimestamps: mocks.getTimestamps,
          addTimestamp: mocks.addTimestamp,
          removeTimestamp: mocks.removeTimestamp,
        });

        results.push(result);
      }

      // First 100 should be allowed (delay: 0, skip: false)
      expect(
        results.slice(0, 100).every((r) => r.delay === 0 && r.skip === false)
      ).toBe(true);

      // Remaining 10 should be throttled (delay > 0, skip: false)
      expect(
        results.slice(100).every((r) => r.delay! > 0 && r.skip === false)
      ).toBe(true);
    });
  });
});
