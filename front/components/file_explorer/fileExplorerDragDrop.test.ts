import {
  canMoveFileToParentFolder,
  getCurrentParentRelativePath,
} from "@app/components/file_explorer/fileExplorerDragDrop";
import { describe, expect, it } from "vitest";

describe("fileExplorerDragDrop", () => {
  it("resolves the current parent from a scoped file path", () => {
    expect(getCurrentParentRelativePath("project/foo/bar.txt")).toBe("foo");
    expect(getCurrentParentRelativePath("conversation/file.txt")).toBe("");
  });

  it("rejects moves to the current parent folder", () => {
    expect(canMoveFileToParentFolder("project/foo/bar.txt", "foo")).toBe(false);
    expect(canMoveFileToParentFolder("project/foo/bar.txt", "foo/baz")).toBe(
      true
    );
  });
});
