import {
  getFrameFunctionReferenceKind,
  resolveFrameFunctionReference,
} from "@app/types/api/frame_function_reference";
import {
  frameContentType,
  frameSlideshowContentType,
  frameV2ContentType,
} from "@app/types/files";
import { describe, expect, it } from "vitest";

describe("resolveFrameFunctionReference", () => {
  it("qualifies a Frames v2 function with the stable Frame identity", () => {
    const result = resolveFrameFunctionReference("list-comments", {
      kind: "v2",
      frameId: "file_123",
    });

    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value).toBe("file_123/list-comments");
  });

  it("rejects cross-Frame references from Frames v2", () => {
    const result = resolveFrameFunctionReference("file_other/list-comments", {
      kind: "v2",
      frameId: "file_123",
    });

    expect(result.isErr()).toBe(true);
  });

  it("keeps legacy Pod-relative resolution unchanged", () => {
    const result = resolveFrameFunctionReference("list-comments", {
      kind: "legacy",
      podFunctionScope: { podId: "pod_123", appPrefix: "comments" },
    });

    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value).toBe(
      "pod_123/comments__list-comments"
    );
  });
});

describe("getFrameFunctionReferenceKind", () => {
  it("classifies only known Frame MIME types", () => {
    expect(getFrameFunctionReferenceKind(frameV2ContentType)).toBe("v2");
    expect(getFrameFunctionReferenceKind(frameContentType)).toBe("legacy");
    expect(getFrameFunctionReferenceKind(frameSlideshowContentType)).toBe(
      "legacy"
    );
  });

  it("does not treat absent or unknown metadata as legacy", () => {
    expect(getFrameFunctionReferenceKind(null)).toBeNull();
    expect(getFrameFunctionReferenceKind(undefined)).toBeNull();
    expect(getFrameFunctionReferenceKind("text/plain")).toBeNull();
  });
});
