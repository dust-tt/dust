import { getFileExplorerPipeline } from "@app/components/file_explorer/fileExplorerPipeline";
import { withVirtualExplorerPath } from "@app/components/file_explorer/utils";
import type { FileSystemEntry } from "@app/types/api/file_system/types";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import { describe, expect, it } from "vitest";

const virtualScopeRoots = [
  { path: "conversation", canonicalPath: "conversation-c1" },
  { path: "pod", canonicalPath: "pod-p1" },
] as const;

function mountFile(
  scopedPath: string,
  fileName = scopedPath.split("/").pop() ?? scopedPath,
  {
    contentType = "text/plain",
    fileId = "file-1",
    fileResourceContentType,
  }: {
    contentType?: string;
    fileId?: string | null;
    fileResourceContentType?: string;
  } = {}
): FileSystemEntry {
  return {
    isDirectory: false,
    fileName,
    path: scopedPath,
    contentType,
    fileId,
    fileResourceContentType,
    sizeBytes: 100,
    lastModifiedMs: 0,
    thumbnailUrl: null,
  };
}

function frameManifest(scopedPath: string): FileSystemEntry {
  return mountFile(scopedPath, FRAME_MANIFEST_FILE, {
    contentType: "application/json",
    fileId: "frame-1",
    fileResourceContentType: frameV2ContentType,
  });
}

describe("getFileExplorerPipeline Frame packages", () => {
  it("collapses a registered source folder into one Frame package", () => {
    const files = [
      frameManifest("conversation-c1/apps/status/manifest.json"),
      mountFile("conversation-c1/apps/status/index.tsx"),
    ];

    const pipeline = getFileExplorerPipeline({
      activeFilter: "all",
      contentNodes: [],
      currentFolderPath: "apps",
      displayFramePackages: true,
      files,
      searchQuery: "",
      sortMode: "last-modified",
    });

    expect(pipeline.sortedNodes).toMatchObject([
      {
        contentType: frameV2ContentType,
        isDirectory: false,
        name: "status",
        path: "apps/status",
      },
    ]);
    expect(pipeline.entryByRelativePath.get("apps/status")).toMatchObject({
      kind: "frame_package",
      fileId: "frame-1",
      sourceFolderCanonicalPath: "conversation-c1/apps/status",
      sourceFolderPath: "apps/status",
    });
    expect(pipeline.filterCounts.frames).toBe(1);
  });

  it("shows raw source after opening the package folder", () => {
    const files = [
      frameManifest("conversation-c1/apps/status/manifest.json"),
      mountFile("conversation-c1/apps/status/index.tsx"),
    ];

    const pipeline = getFileExplorerPipeline({
      activeFilter: "all",
      contentNodes: [],
      currentFolderPath: "apps/status",
      displayFramePackages: true,
      files,
      searchQuery: "",
      sortMode: "name-asc",
    });

    expect(pipeline.sortedNodes.map((node) => node.name)).toEqual([
      "index.tsx",
      "manifest.json",
    ]);
    expect(
      pipeline.entryByRelativePath.get("apps/status/manifest.json")?.kind
    ).toBe("file");
  });

  it("keeps an unregistered manifest as ordinary source", () => {
    const files = [
      mountFile(
        "conversation-c1/apps/status/manifest.json",
        FRAME_MANIFEST_FILE,
        {
          contentType: "application/json",
          fileId: null,
        }
      ),
      mountFile("conversation-c1/apps/status/index.tsx"),
    ];

    const pipeline = getFileExplorerPipeline({
      activeFilter: "all",
      contentNodes: [],
      currentFolderPath: "apps",
      displayFramePackages: true,
      files,
      searchQuery: "",
      sortMode: "name-asc",
    });

    expect(pipeline.sortedNodes).toMatchObject([
      { isDirectory: true, name: "status", path: "apps/status" },
    ]);
  });

  it("keeps registered source as a folder when package display is disabled", () => {
    const files = [
      frameManifest("conversation-c1/apps/status/manifest.json"),
      mountFile("conversation-c1/apps/status/index.tsx"),
    ];

    const pipeline = getFileExplorerPipeline({
      activeFilter: "all",
      contentNodes: [],
      currentFolderPath: "apps",
      files,
      searchQuery: "",
      sortMode: "name-asc",
    });

    expect(pipeline.sortedNodes).toMatchObject([
      { isDirectory: true, name: "status", path: "apps/status" },
    ]);
  });

  it("collapses packages under virtual scope roots", () => {
    const files = [
      withVirtualExplorerPath(
        frameManifest("conversation-c1/status/manifest.json"),
        "conversation"
      ),
      withVirtualExplorerPath(
        mountFile("conversation-c1/status/index.tsx"),
        "conversation"
      ),
    ];

    const pipeline = getFileExplorerPipeline({
      activeFilter: "all",
      contentNodes: [],
      currentFolderPath: "conversation",
      displayFramePackages: true,
      files,
      searchQuery: "",
      sortMode: "last-modified",
      virtualScopeRoots,
    });

    expect(pipeline.sortedNodes).toMatchObject([
      {
        isDirectory: false,
        name: "status",
        path: "conversation/status",
      },
    ]);
    expect(
      pipeline.entryByRelativePath.get("conversation/status")
    ).toMatchObject({
      sourceFolderCanonicalPath: "conversation-c1/status",
      sourceFolderPath: "conversation/status",
    });
  });
});

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
      virtualScopeRoots,
    });

    expect(sortedNodes.map((n) => n.path)).toEqual(["conversation", "pod"]);
    expect(sortedNodes.map((n) => n.canonicalPath)).toEqual([
      "conversation-c1",
      "pod-p1",
    ]);
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
      virtualScopeRoots,
    });

    expect(sortedNodes.map((n) => n.path)).toEqual(["conversation/notes.txt"]);
  });
});

describe("getFileExplorerPipeline search", () => {
  it("searches within the current folder and its descendants", () => {
    const files = [
      withVirtualExplorerPath(
        mountFile("conversation-c1/reports/summary.txt", "summary.txt"),
        "conversation"
      ),
      withVirtualExplorerPath(
        mountFile("conversation-c1/notes.txt"),
        "conversation"
      ),
      withVirtualExplorerPath(
        mountFile("pod-p1/archive/readme.md", "readme.md"),
        "pod"
      ),
    ];

    const { sortedNodes } = getFileExplorerPipeline({
      activeFilter: "all",
      contentNodes: [],
      currentFolderPath: "conversation",
      files,
      searchQuery: "readme",
      sortMode: "last-modified",
      virtualScopeRoots,
    });

    expect(sortedNodes).toEqual([]);
  });

  it("finds nested files under the current folder", () => {
    const files = [
      withVirtualExplorerPath(
        mountFile("conversation-c1/reports/q1/summary.txt", "summary.txt"),
        "conversation"
      ),
      withVirtualExplorerPath(
        mountFile("pod-p1/readme.md", "readme.md"),
        "pod"
      ),
    ];

    const { sortedNodes } = getFileExplorerPipeline({
      activeFilter: "all",
      contentNodes: [],
      currentFolderPath: "conversation",
      files,
      searchQuery: "summary",
      sortMode: "last-modified",
      virtualScopeRoots,
    });

    expect(sortedNodes.map((n) => n.path)).toEqual([
      "conversation/reports/q1/summary.txt",
    ]);
  });

  it("searches the entire tree from the virtual root", () => {
    const files = [
      withVirtualExplorerPath(
        mountFile("conversation-c1/reports/q1/summary.txt", "summary.txt"),
        "conversation"
      ),
    ];

    const { sortedNodes } = getFileExplorerPipeline({
      activeFilter: "all",
      contentNodes: [],
      currentFolderPath: "",
      files,
      searchQuery: "reports",
      sortMode: "last-modified",
      virtualScopeRoots,
    });

    expect(sortedNodes.map((n) => n.path)).toEqual([
      "conversation/reports/q1/summary.txt",
    ]);
  });
});

describe("getFileExplorerPipeline type filters", () => {
  it("keeps the folder hierarchy for All", () => {
    const files = [
      withVirtualExplorerPath(
        mountFile("pod-p1/apps/dashboard.html", "dashboard.html", {
          contentType: frameContentType,
        }),
        "pod"
      ),
      withVirtualExplorerPath(mountFile("pod-p1/notes.txt"), "pod"),
    ];

    const { sortedNodes, filterCounts } = getFileExplorerPipeline({
      activeFilter: "all",
      contentNodes: [],
      currentFolderPath: "",
      files,
      searchQuery: "",
      sortMode: "name-asc",
      virtualScopeRoots,
    });

    expect(sortedNodes.map((n) => n.path)).toEqual(["conversation", "pod"]);
    expect(filterCounts.frames).toBe(1);
    // Built tree folders only (synthetic empty scope roots are hierarchical-only).
    expect(filterCounts.folders).toBe(2); // pod, pod/apps
  });

  it("lists nested Frames flat when the Frames filter is active", () => {
    const files = [
      withVirtualExplorerPath(
        mountFile("pod-p1/apps/dashboard.html", "dashboard.html", {
          contentType: frameContentType,
        }),
        "pod"
      ),
      withVirtualExplorerPath(mountFile("pod-p1/notes.txt"), "pod"),
    ];

    const { sortedNodes } = getFileExplorerPipeline({
      activeFilter: "frames",
      contentNodes: [],
      currentFolderPath: "",
      files,
      searchQuery: "",
      sortMode: "name-asc",
      virtualScopeRoots,
    });

    expect(sortedNodes.map((n) => n.path)).toEqual(["pod/apps/dashboard.html"]);
  });

  it("lists nested folders flat when the Folders filter is active", () => {
    const files = [
      withVirtualExplorerPath(
        mountFile("pod-p1/apps/nested/notes.txt", "notes.txt"),
        "pod"
      ),
    ];

    const { sortedNodes } = getFileExplorerPipeline({
      activeFilter: "folders",
      contentNodes: [],
      currentFolderPath: "",
      files,
      searchQuery: "",
      sortMode: "name-asc",
      virtualScopeRoots,
    });

    // Sorted by name: apps, nested, pod.
    expect(sortedNodes.map((n) => n.path)).toEqual([
      "pod/apps",
      "pod/apps/nested",
      "pod",
    ]);
  });

  it("intersects a type filter with search", () => {
    const files = [
      withVirtualExplorerPath(
        mountFile("pod-p1/apps/status.html", "status.html", {
          contentType: frameContentType,
        }),
        "pod"
      ),
      withVirtualExplorerPath(
        mountFile("pod-p1/apps/dashboard.html", "dashboard.html", {
          contentType: frameContentType,
        }),
        "pod"
      ),
      withVirtualExplorerPath(
        mountFile("pod-p1/status.txt", "status.txt"),
        "pod"
      ),
    ];

    const { sortedNodes } = getFileExplorerPipeline({
      activeFilter: "frames",
      contentNodes: [],
      currentFolderPath: "",
      files,
      searchQuery: "status",
      sortMode: "name-asc",
      virtualScopeRoots,
    });

    expect(sortedNodes.map((n) => n.path)).toEqual(["pod/apps/status.html"]);
  });

  it("lists collapsed Frame packages under Frames", () => {
    const files = [
      withVirtualExplorerPath(
        frameManifest("pod-p1/apps/status/manifest.json"),
        "pod"
      ),
      withVirtualExplorerPath(mountFile("pod-p1/apps/status/index.tsx"), "pod"),
    ];

    const { sortedNodes, filterCounts } = getFileExplorerPipeline({
      activeFilter: "frames",
      contentNodes: [],
      currentFolderPath: "",
      displayFramePackages: true,
      files,
      searchQuery: "",
      sortMode: "name-asc",
      virtualScopeRoots,
    });

    expect(filterCounts.frames).toBe(1);
    expect(sortedNodes).toMatchObject([
      {
        contentType: frameV2ContentType,
        isDirectory: false,
        name: "status",
        path: "pod/apps/status",
      },
    ]);
  });

  it("keeps Frame package internals opaque under every flat type filter", () => {
    const files = [
      withVirtualExplorerPath(
        frameManifest("pod-p1/apps/status/manifest.json"),
        "pod"
      ),
      withVirtualExplorerPath(
        mountFile("pod-p1/apps/status/index.tsx", "index.tsx", {
          contentType: "text/typescript",
        }),
        "pod"
      ),
      withVirtualExplorerPath(
        mountFile("pod-p1/apps/status/functions/foo.ts", "foo.ts", {
          contentType: "text/typescript",
        }),
        "pod"
      ),
      withVirtualExplorerPath(
        mountFile("pod-p1/apps/status/readme.md", "readme.md", {
          contentType: "text/markdown",
        }),
        "pod"
      ),
      withVirtualExplorerPath(
        mountFile("pod-p1/notes.ts", "notes.ts", {
          contentType: "text/typescript",
        }),
        "pod"
      ),
      withVirtualExplorerPath(
        mountFile("pod-p1/outside.md", "outside.md", {
          contentType: "text/markdown",
        }),
        "pod"
      ),
    ];

    const base = {
      contentNodes: [],
      currentFolderPath: "",
      displayFramePackages: true,
      files,
      searchQuery: "",
      sortMode: "name-asc" as const,
      virtualScopeRoots,
    };

    const frames = getFileExplorerPipeline({ ...base, activeFilter: "frames" });
    expect(frames.sortedNodes.map((n) => n.path)).toEqual(["pod/apps/status"]);
    expect(frames.filterCounts.frames).toBe(1);

    const code = getFileExplorerPipeline({ ...base, activeFilter: "code" });
    expect(code.sortedNodes.map((n) => n.path)).toEqual(["pod/notes.ts"]);
    expect(code.filterCounts.code).toBe(1);

    const texts = getFileExplorerPipeline({ ...base, activeFilter: "texts" });
    expect(texts.sortedNodes.map((n) => n.path)).toEqual(["pod/outside.md"]);

    const folders = getFileExplorerPipeline({
      ...base,
      activeFilter: "folders",
    });
    // Ancestor folders of the package are fine; nothing inside the bundle.
    expect(
      folders.sortedNodes.every((n) => !n.path.startsWith("pod/apps/status/"))
    ).toBe(true);
    expect(folders.sortedNodes.map((n) => n.path)).not.toContain(
      "pod/apps/status"
    );
  });
});
