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

  it("refuses every reference from a legacy Frame", () => {
    const result = resolveFrameFunctionReference("list-comments", {
      kind: "legacy",
    });

    expect(result.isErr()).toBe(true);
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
