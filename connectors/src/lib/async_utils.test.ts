import { describe, expect, it } from "vitest";

import { getAdaptiveConcurrency } from "./async_utils";

describe("getAdaptiveConcurrency", () => {
  const MAX_FILE_SIZE = 256 * 1024 * 1024; // 256 MB
  const DEFAULT_CONCURRENCY = 8;

  it("returns the default concurrency when all files are small", () => {
    const files = [{ size: 1024 }, { size: 2048 }, { size: 4096 }];

    expect(
      getAdaptiveConcurrency(files, MAX_FILE_SIZE, DEFAULT_CONCURRENCY)
    ).toBe(DEFAULT_CONCURRENCY);
  });

  it("lowers concurrency as the largest file approaches the max size", () => {
    const files = [{ size: MAX_FILE_SIZE / 2 }, { size: 1024 }];

    // maxFileSize / (maxFileSize / 2) === 2
    expect(
      getAdaptiveConcurrency(files, MAX_FILE_SIZE, DEFAULT_CONCURRENCY)
    ).toBe(2);
  });

  it("returns the default concurrency for an empty list", () => {
    expect(getAdaptiveConcurrency([], MAX_FILE_SIZE, DEFAULT_CONCURRENCY)).toBe(
      DEFAULT_CONCURRENCY
    );
  });

  it("treats files with unknown size as worst-case", () => {
    // Google-native Docs/Slides come back with no size from the Drive API. They
    // must not silently get maximum concurrency, since they can be huge once
    // exported and are fully buffered in memory.
    const files = [{ size: null }, { size: undefined }, { size: 1024 }];

    expect(
      getAdaptiveConcurrency(files, MAX_FILE_SIZE, DEFAULT_CONCURRENCY)
    ).toBe(1);
  });

  it("treats a mix of known-small and unknown-size files as worst-case", () => {
    const files = [{ size: 1024 }, { size: 2048 }, { size: null }];

    expect(
      getAdaptiveConcurrency(files, MAX_FILE_SIZE, DEFAULT_CONCURRENCY)
    ).toBe(1);
  });

  it("ignores files already over the max size (they are skipped before download)", () => {
    const files = [{ size: MAX_FILE_SIZE * 2 }, { size: 1024 }];

    expect(
      getAdaptiveConcurrency(files, MAX_FILE_SIZE, DEFAULT_CONCURRENCY)
    ).toBe(DEFAULT_CONCURRENCY);
  });
});
