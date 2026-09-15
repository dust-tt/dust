// @vitest-environment node

import { validateFrameContent } from "@app/lib/api/viz/validate_frame_types";
import { mockFrameRuntimeTypes } from "@app/tests/utils/frame_runtime_types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let nowMs = Date.now();
beforeEach(() => {
  nowMs += 60_001;
  vi.spyOn(Date, "now").mockReturnValue(nowMs);
});
afterEach(() => vi.restoreAllMocks());

describe("shared Frame type validation", () => {
  it("validates edited content against its existing sibling imports", async () => {
    mockFrameRuntimeTypes();
    const reader = {
      list: async () => ["index.tsx", "value.ts"],
      read: async (relativePath: string) =>
        relativePath === "value.ts" ? "export const value = 3" : "old content",
    };
    const result = await validateFrameContent(
      'import { value } from "./value"; export default () => <div>{value}</div>',
      "index.tsx",
      reader
    );
    expect(result.isOk()).toBe(true);
  });
  it("returns syntax diagnostics even when Viz is unavailable", async () => {
    const fetchMock = mockFrameRuntimeTypes().mockResolvedValue(
      new Response(null, { status: 503 })
    );
    const result = await validateFrameContent(
      "export default () => <div>broken",
      "index.tsx"
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.tracked).toBe(false);
      expect(result.error.message).toContain(
        "TypeScript syntax errors detected"
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an unavailable checker explicitly", async () => {
    mockFrameRuntimeTypes().mockResolvedValue(
      new Response(null, { status: 503 })
    );
    const result = await validateFrameContent(
      "export default () => <div>Hello</div>",
      "index.tsx"
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.tracked).toBe(true);
      expect(result.error.message).toContain(
        "validation is temporarily unavailable"
      );
    }
  });

  it("shares the cached declarations between concurrent checks", async () => {
    const fetchMock = mockFrameRuntimeTypes();
    const results = await Promise.all([
      validateFrameContent(
        "export default () => <div>Hello</div>",
        "first.tsx"
      ),
      validateFrameContent(
        'import { fakeThing } from "react"; export default () => fakeThing()',
        "second.tsx"
      ),
    ]);
    expect(results[0].isOk()).toBe(true);
    expect(results[1].isErr()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    nowMs += 60_001;
    vi.spyOn(Date, "now").mockReturnValue(nowMs);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    const rechecked = await validateFrameContent(
      "export default () => <div>Hello</div>",
      "third.tsx"
    );
    expect(rechecked.isOk()).toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { "If-None-Match": '"frame-types-test"' },
      })
    );
  });
});
