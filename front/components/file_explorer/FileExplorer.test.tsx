import { FileExplorer } from "@app/components/file_explorer/FileExplorer";
import type { FileSystemFileEntry } from "@app/types/api/file_system/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  lastModifiedMs,
}: {
  contentType: string;
  fileName: string;
  lastModifiedMs: number;
}): FileSystemFileEntry {
  return {
    isDirectory: false,
    fileName,
    path: `conversation-c1/${fileName}`,
    contentType,
    fileId: `file-${fileName}`,
    sizeBytes: 100,
    lastModifiedMs,
    thumbnailUrl: null,
  };
}

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
      <FileExplorer
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
      <FileExplorer
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
