import { FileExplorer } from "@app/components/file_explorer/FileExplorer";
import type { FileSystemFileEntry } from "@app/types/api/file_system/types";
import { frameV2ContentType } from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { useState } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockClientFetch = vi.fn();
vi.mock("@app/lib/egress/client", () => ({
  clientFetch: (...args: unknown[]) => mockClientFetch(...args),
}));
vi.mock("@app/lib/swr/useIsMobile", () => ({
  useIsMobile: () => false,
}));

function makeFile({
  contentType,
  fileName,
  fileResourceContentType,
  lastModifiedMs,
  path = fileName,
}: {
  contentType: string;
  fileName: string;
  fileResourceContentType?: string;
  lastModifiedMs: number;
  path?: string;
}): FileSystemFileEntry {
  return {
    isDirectory: false,
    fileName,
    path: `conversation-c1/${path}`,
    contentType,
    fileId: `file-${fileName}`,
    fileResourceContentType,
    sizeBytes: 100,
    lastModifiedMs,
    thumbnailUrl: null,
  };
}

type ControlledFileExplorerProps = Omit<
  ComponentProps<typeof FileExplorer>,
  "currentFolderPath" | "onCurrentFolderChange"
>;

// `FileExplorer` is a controlled component: folder navigation lives in the
// parent (in the app, in the URL). Tests hold it in local state.
function ControlledFileExplorer(props: ControlledFileExplorerProps) {
  const [currentFolderPath, setCurrentFolderPath] = useState("");

  return (
    <FileExplorer
      {...props}
      currentFolderPath={currentFolderPath}
      onCurrentFolderChange={setCurrentFolderPath}
    />
  );
}

beforeAll(() => {
  // Radix relies on this browser API when opening dropdown content.
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("FileExplorer file opening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClientFetch.mockResolvedValue(new Response("preview content"));
  });

  it("downloads binary files instead of opening the preview dialog", async () => {
    const archive = makeFile({
      contentType: "application/zip",
      fileName: "archive.zip",
      lastModifiedMs: 1,
    });
    let finishDownload: (() => void) | undefined;
    const onFileDownload = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishDownload = resolve;
        })
    );

    render(
      <ControlledFileExplorer
        defaultViewMode="list"
        files={[archive]}
        getFileUrl={(path) => `/files/${path}`}
        isLoading={false}
        onFileDownload={onFileDownload}
      />
    );

    const archiveTitle = screen.getByText("archive.zip");
    fireEvent.click(archiveTitle);

    await waitFor(() =>
      expect(onFileDownload).toHaveBeenCalledWith({
        ...archive,
        kind: "file",
      })
    );
    expect(archiveTitle.closest("[aria-busy]")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    fireEvent.click(archiveTitle);
    expect(onFileDownload).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockClientFetch).not.toHaveBeenCalled();

    finishDownload?.();
    await waitFor(() =>
      expect(archiveTitle.closest("[aria-busy]")).toHaveAttribute(
        "aria-busy",
        "false"
      )
    );
  });

  it("skips binary files in preview navigation", async () => {
    const first = makeFile({
      contentType: "text/plain",
      fileName: "first.txt",
      lastModifiedMs: 3,
    });
    const archive = makeFile({
      contentType: "application/zip",
      fileName: "archive.zip",
      lastModifiedMs: 2,
    });
    const second = makeFile({
      contentType: "text/plain",
      fileName: "second.txt",
      lastModifiedMs: 1,
    });

    render(
      <ControlledFileExplorer
        defaultViewMode="list"
        files={[first, archive, second]}
        getFileUrl={(path) => `/files/${path}`}
        isLoading={false}
        onFileDownload={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getByText("first.txt"));
    expect(
      await screen.findByRole("dialog", { name: "first.txt" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(
      await screen.findByRole("dialog", { name: "second.txt" })
    ).toBeInTheDocument();
  });
});

describe("FileExplorer navigation", () => {
  it("resets the type filter when opening a folder", () => {
    const nestedFile = makeFile({
      contentType: "text/plain",
      fileName: "nested.txt",
      lastModifiedMs: 1,
      path: "folder/nested.txt",
    });
    const rootFile = makeFile({
      contentType: "text/plain",
      fileName: "root.txt",
      lastModifiedMs: 1,
    });

    render(
      <ControlledFileExplorer
        defaultViewMode="list"
        files={[nestedFile, rootFile]}
        getFileUrl={(path) => `/files/${path}`}
        isLoading={false}
        onFileDownload={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Folders" }));
    fireEvent.click(screen.getByText("folder"));

    expect(screen.getByText("nested.txt")).toBeInTheDocument();
  });
});

describe("FileExplorer Frame packages", () => {
  it("opens the Frame and exposes only View source and Delete", async () => {
    const user = userEvent.setup();
    mockClientFetch.mockResolvedValue(new Response("preview content"));
    const manifest = makeFile({
      contentType: "application/json",
      fileName: "manifest.json",
      fileResourceContentType: frameV2ContentType,
      lastModifiedMs: 2,
      path: "status/manifest.json",
    });
    const source = makeFile({
      contentType: "text/typescript",
      fileName: "index.tsx",
      lastModifiedMs: 1,
      path: "status/index.tsx",
    });
    const onOpenInteractive = vi.fn();
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(
      <ControlledFileExplorer
        defaultViewMode="list"
        displayFramePackages
        files={[manifest, source]}
        getFileUrl={(path) => `/files/${path}`}
        isLoading={false}
        onDelete={onDelete}
        onFileDownload={vi.fn().mockResolvedValue(undefined)}
        onMoveFile={vi.fn().mockResolvedValue(new Ok(undefined))}
        onOpenInteractive={onOpenInteractive}
        onRename={vi.fn()}
      />
    );

    const packageTitle = screen.getByText("status");
    fireEvent.click(packageTitle);
    expect(onOpenInteractive).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file-manifest.json",
        kind: "frame_package",
        path: "conversation-c1/status/manifest.json",
        sourceFolderPath: "status",
      })
    );

    const packageRow = packageTitle.closest("div.cursor-pointer");
    expect(packageRow).toBeInstanceOf(HTMLElement);
    if (!(packageRow instanceof HTMLElement)) {
      throw new Error("Frame package row not found.");
    }
    await user.click(within(packageRow).getByRole("button"));
    expect(screen.getByText("View source")).toBeInTheDocument();
    expect(screen.queryByText("Rename")).not.toBeInTheDocument();
    expect(screen.queryByText("Move to…")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "frame_package",
        path: "conversation-c1/status/manifest.json",
      })
    );

    await user.click(within(packageRow).getByRole("button"));
    fireEvent.click(screen.getByText("View source"));
    const manifestTitle = await screen.findByText("manifest.json");
    expect(screen.getByText("index.tsx")).toBeInTheDocument();

    fireEvent.click(manifestTitle);
    expect(
      await screen.findByRole("dialog", { name: "manifest.json" })
    ).toBeInTheDocument();
    expect(await screen.findByText("preview content")).toBeInTheDocument();
  });
});
