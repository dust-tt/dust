import { getFileExplorerPipeline } from "@app/components/file_explorer/fileExplorerPipeline";
import { withVirtualExplorerPath } from "@app/components/file_explorer/utils";
import type { FileSystemEntry } from "@app/types/api/file_system/types";
import { describe, expect, it } from "vitest";

function mountFile(
  scopedPath: string,
  fileName = scopedPath.split("/").pop() ?? scopedPath
): FileSystemEntry {
  return {
    isDirectory: false,
    fileName,
    path: scopedPath,
    contentType: "text/plain",
    fileId: "file-1",
    sizeBytes: 100,
    lastModifiedMs: 0,
    thumbnailUrl: null,
  };
}

describe("getFileExplorerPipeline virtualScopeRoots", () => {
  it("shows scope folders at the virtual root", () => {
    const files = [
      withVirtualExplorerPath(
        mountFile("conversation-c1/notes.txt"),
        "conversation"
      ),
    ];

    const { sortedNodes } = getFileExplorerPipeline({
      activeFilter: "all",
      contentNodes: [],
      currentFolderPath: "",
      files,
      searchQuery: "",
      sortMode: "last-modified",
      virtualScopeRoots: ["conversation", "pod"],
    });

    expect(sortedNodes.map((n) => n.path)).toEqual(["conversation", "pod"]);
  });

  it("lists files inside a scope folder", () => {
    const files = [
      withVirtualExplorerPath(
        mountFile("conversation-c1/notes.txt"),
        "conversation"
      ),
      withVirtualExplorerPath(mountFile("pod-p1/readme.md"), "pod"),
    ];

    const { sortedNodes } = getFileExplorerPipeline({
      activeFilter: "all",
      contentNodes: [],
      currentFolderPath: "conversation",
      files,
      searchQuery: "",
      sortMode: "last-modified",
      virtualScopeRoots: ["conversation", "pod"],
    });

    expect(sortedNodes.map((n) => n.path)).toEqual(["conversation/notes.txt"]);
  });
});
