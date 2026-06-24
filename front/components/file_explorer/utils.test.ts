import type {
  FileEntry,
  FileSystemTreeNode,
} from "@app/components/file_explorer/types";
import {
  buildFileSystemTree,
  buildFolderTree,
  findTreeNodeByPath,
  getChildrenAtFolderPath,
  getExplorerRelativePath,
  getVirtualScopeRootNodes,
  isFileExplorerMovableFile,
  withVirtualExplorerPath,
} from "@app/components/file_explorer/utils";
import type { FileSystemEntry } from "@app/types/api/file_system/types";
import { frameContentType, frameSlideshowContentType } from "@app/types/files";
import { describe, expect, it } from "vitest";

function mountFile(
  relativePath: string,
  useCase: "project" | "conversation" = "project"
): FileSystemEntry {
  return {
    isDirectory: false,
    fileName: relativePath.split("/").pop() ?? relativePath,
    path: `${useCase}/${relativePath}`,
    contentType: "text/plain",
    fileId: "file-1",
    sizeBytes: 100,
    lastModifiedMs: 0,
    thumbnailUrl: null,
  };
}

function mountDir(
  relativePath: string,
  useCase: "project" | "conversation" = "project"
): FileSystemEntry {
  return {
    isDirectory: true,
    fileName: relativePath.split("/").pop() ?? relativePath,
    path: `${useCase}/${relativePath}`,
    sizeBytes: 0,
    lastModifiedMs: 0,
  };
}

function collectTreeNodes(nodes: FileSystemTreeNode[]): FileSystemTreeNode[] {
  return nodes.flatMap((node) => [node, ...collectTreeNodes(node.children)]);
}

function sortedNodePaths(nodes: FileSystemTreeNode[]): string[] {
  return collectTreeNodes(nodes)
    .map((n) => `${n.isDirectory ? "d" : "f"}:${n.path}`)
    .sort();
}

function makeFileEntry(contentType: string): FileEntry {
  return {
    kind: "file",
    path: "project/foo.txt",
    fileName: "foo.txt",
    contentType,
    fileId: "file-1",
    isDirectory: false,
    lastModifiedMs: 0,
    sizeBytes: 0,
    thumbnailUrl: null,
  };
}

describe("isFileExplorerMovableFile", () => {
  it("returns false for fileId-backed frames and slideshows", () => {
    expect(isFileExplorerMovableFile(makeFileEntry(frameContentType))).toBe(
      false
    );
    expect(
      isFileExplorerMovableFile(makeFileEntry(frameSlideshowContentType))
    ).toBe(false);
  });

  it("returns true for mount-addressed files with a fileId", () => {
    expect(isFileExplorerMovableFile(makeFileEntry("text/plain"))).toBe(true);
  });

  it("returns true for path-only files without a fileId", () => {
    expect(
      isFileExplorerMovableFile({
        ...makeFileEntry("text/plain"),
        fileId: null,
      })
    ).toBe(true);
  });
});

describe("buildFileSystemTree", () => {
  it("returns an empty tree for no entries", () => {
    expect(buildFileSystemTree([])).toEqual([]);
  });

  it("places a root-level file without inferring directories", () => {
    const tree = buildFileSystemTree([mountFile("readme.txt")]);

    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      name: "readme.txt",
      path: "readme.txt",
      isDirectory: false,
    });
  });

  it("infers ancestor directories from nested file paths", () => {
    const tree = buildFileSystemTree([mountFile("reports/q1/summary.pdf")]);

    const reports = findTreeNodeByPath(tree, "reports");
    const q1 = findTreeNodeByPath(tree, "reports/q1");
    const summary = findTreeNodeByPath(tree, "reports/q1/summary.pdf");

    expect(reports?.isDirectory).toBe(true);
    expect(q1?.isDirectory).toBe(true);
    expect(summary?.isDirectory).toBe(false);
    expect(q1?.children.map((n) => n.path)).toEqual(["reports/q1/summary.pdf"]);
  });

  it("adds empty folders from directory entries", () => {
    const tree = buildFileSystemTree([mountDir("archive")]);

    const archive = findTreeNodeByPath(tree, "archive");
    expect(archive?.isDirectory).toBe(true);
    expect(archive?.children).toEqual([]);
  });

  it("creates nested empty folders without files", () => {
    const tree = buildFileSystemTree([mountDir("a/b")]);

    expect(findTreeNodeByPath(tree, "a")?.isDirectory).toBe(true);
    expect(findTreeNodeByPath(tree, "a/b")?.isDirectory).toBe(true);
    expect(getChildrenAtFolderPath(tree, "a").map((n) => n.path)).toEqual([
      "a/b",
    ]);
  });

  it("merges inferred folders with empty sibling directory entries", () => {
    const tree = buildFileSystemTree([
      mountFile("docs/guide.txt"),
      mountDir("docs/drafts"),
    ]);

    const docs = findTreeNodeByPath(tree, "docs");
    expect(docs?.children.map((n) => n.path).sort()).toEqual([
      "docs/drafts",
      "docs/guide.txt",
    ]);
  });

  it("skips directory entries when the path was already inferred from files", () => {
    const withPlaceholder = buildFileSystemTree([
      mountDir("reports"),
      mountFile("reports/annual.pdf"),
    ]);
    const inferredOnly = buildFileSystemTree([mountFile("reports/annual.pdf")]);

    expect(sortedNodePaths(withPlaceholder)).toEqual(
      sortedNodePaths(inferredOnly)
    );
  });

  it("produces the same tree regardless of entry order", () => {
    const filesFirst = [
      mountFile("a/x.txt"),
      mountFile("b/y.txt"),
      mountDir("a/empty"),
      mountDir("c"),
    ];
    const dirsFirst = [
      mountDir("c"),
      mountDir("a/empty"),
      mountFile("b/y.txt"),
      mountFile("a/x.txt"),
    ];
    const mixed = [
      mountFile("b/y.txt"),
      mountDir("a/empty"),
      mountFile("a/x.txt"),
      mountDir("c"),
    ];

    const expected = sortedNodePaths(buildFileSystemTree(dirsFirst));
    expect(sortedNodePaths(buildFileSystemTree(filesFirst))).toEqual(expected);
    expect(sortedNodePaths(buildFileSystemTree(mixed))).toEqual(expected);
  });

  it("strips the scoped use-case prefix from paths", () => {
    const tree = buildFileSystemTree([
      mountFile("sandbox/out.txt", "conversation"),
    ]);

    expect(findTreeNodeByPath(tree, "sandbox/out.txt")).toBeDefined();
    expect(findTreeNodeByPath(tree, "conversation/sandbox/out.txt")).toBe(
      undefined
    );
  });

  it("ignores entries with no path beyond the use-case prefix", () => {
    const tree = buildFileSystemTree([
      {
        isDirectory: false,
        fileName: "",
        path: "project/",
        contentType: "text/plain",
        fileId: null,
        sizeBytes: 0,
        lastModifiedMs: 0,
        thumbnailUrl: null,
      },
      mountFile("ok.txt"),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.path).toBe("ok.txt");
  });

  it("supports navigation helpers at inferred and explicit folders", () => {
    const tree = buildFileSystemTree([
      mountDir("shared"),
      mountFile("shared/one.txt"),
      mountFile("shared/two.txt"),
    ]);

    expect(getChildrenAtFolderPath(tree, "").map((n) => n.path)).toEqual([
      "shared",
    ]);
    expect(
      getChildrenAtFolderPath(tree, "shared")
        .map((n) => n.path)
        .sort()
    ).toEqual(["shared/one.txt", "shared/two.txt"]);
  });
});

describe("buildFolderTree", () => {
  it("returns only directory nodes", () => {
    const tree = buildFolderTree([
      mountDir("docs"),
      mountFile("docs/readme.txt"),
      mountFile("notes.txt"),
    ]);

    expect(collectTreeNodes(tree).every((n) => n.isDirectory)).toBe(true);
    expect(findTreeNodeByPath(tree, "docs/readme.txt")).toBeUndefined();
    expect(findTreeNodeByPath(tree, "docs")?.isDirectory).toBe(true);
  });
});

describe("getExplorerRelativePath", () => {
  it("uses virtualPath when set", () => {
    expect(
      getExplorerRelativePath({
        path: "conversation-abc/report.pdf",
        virtualPath: "conversation/report.pdf",
      })
    ).toBe("conversation/report.pdf");
  });

  it("falls back to stripping the scoped prefix from path", () => {
    expect(getExplorerRelativePath({ path: "pod-xyz/data.csv" })).toBe(
      "data.csv"
    );
  });
});

describe("withVirtualExplorerPath", () => {
  it("prefixes the mount-relative path with a scope label", () => {
    const entry = withVirtualExplorerPath(
      mountFile("reports/q1.pdf", "conversation"),
      "conversation"
    );
    expect(entry.virtualPath).toBe("conversation/reports/q1.pdf");
    expect(entry.path).toBe("conversation/reports/q1.pdf");
  });
});

describe("buildFileSystemTree with virtualPath", () => {
  it("builds a merged tree with conversation and pod scope folders", () => {
    const tree = buildFileSystemTree([
      withVirtualExplorerPath(
        mountFile("notes.txt", "conversation"),
        "conversation"
      ),
      withVirtualExplorerPath(mountFile("shared/readme.md"), "pod"),
    ]);

    expect(
      getChildrenAtFolderPath(tree, "")
        .map((n) => n.path)
        .sort()
    ).toEqual(["conversation", "pod"]);
    expect(
      getChildrenAtFolderPath(tree, "conversation").map((n) => n.path)
    ).toEqual(["conversation/notes.txt"]);
    expect(
      getChildrenAtFolderPath(tree, "pod/shared").map((n) => n.path)
    ).toEqual(["pod/shared/readme.md"]);
  });
});

describe("getVirtualScopeRootNodes", () => {
  it("includes empty scope folders missing from the tree", () => {
    const tree = buildFileSystemTree([
      withVirtualExplorerPath(mountFile("a.txt"), "pod"),
    ]);

    const roots = getVirtualScopeRootNodes(tree, ["conversation", "pod"]);
    expect(roots.map((n) => n.path)).toEqual(["conversation", "pod"]);
    expect(roots[0]?.children).toEqual([]);
    expect(roots[1]?.children).toHaveLength(1);
  });
});
