import type {
  FileEntry,
  FileExplorerDownloadEntry,
  FramePackageEntry,
} from "@app/components/file_explorer/types";
import { useFileExplorerDownload } from "@app/components/file_explorer/useFileExplorerDownload";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { frameV2ContentType } from "@app/types/files";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrepareFolderArchiveDownload = vi.fn();
const mockGetFileResponse = vi.fn();
const mockSendNotification = vi.fn();
const mockLoggerError = vi.fn();
const mockCreateObjectURL = vi.fn(() => "blob:file-download");

vi.mock("@app/lib/swr/files", () => ({
  prepareFolderArchiveDownload: (...args: unknown[]) =>
    mockPrepareFolderArchiveDownload(...args),
}));
vi.mock("@app/hooks/useNotification", () => ({
  useSendNotification: () => mockSendNotification,
}));
vi.mock("@app/logger/logger", () => ({
  default: { error: (...args: unknown[]) => mockLoggerError(...args) },
}));

const owner = LightWorkspaceFactory.build({ sId: "w_test_ws" });
const regularFile: FileEntry = {
  kind: "file",
  isDirectory: false,
  contentType: "text/plain",
  fileName: "notes.txt",
  path: "conversation-c1/notes.txt",
  fileId: "fil_notes",
  sizeBytes: 5,
  lastModifiedMs: 1,
  thumbnailUrl: null,
};
const folder: FileExplorerDownloadEntry = {
  kind: "folder",
  name: "Q1 reports",
  path: "conversation-c1/Q1 reports",
};
const framePackage: FramePackageEntry = {
  kind: "frame_package",
  isDirectory: false,
  contentType: frameV2ContentType,
  fileName: "status",
  path: "conversation-c1/status/manifest.json",
  sourceFolderPath: "status",
  sourceFolderCanonicalPath: "conversation-c1/status",
  fileId: "fil_frame",
  sizeBytes: 100,
  lastModifiedMs: 1,
  thumbnailUrl: null,
};

describe("useFileExplorerDownload", () => {
  let clickedAnchor: HTMLAnchorElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    clickedAnchor = undefined;
    mockGetFileResponse.mockResolvedValue(new Response("notes"));
    mockPrepareFolderArchiveDownload.mockResolvedValue(
      "https://api.example.com/archive.zip"
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: mockCreateObjectURL,
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clickedAnchor = this;
    });
  });

  it("downloads a regular file through the common handler", async () => {
    const { result } = renderHook(() =>
      useFileExplorerDownload({
        owner,
        getFileResponse: mockGetFileResponse,
      })
    );

    await act(async () => result.current(regularFile));

    expect(mockGetFileResponse).toHaveBeenCalledWith(regularFile.path);
    expect(clickedAnchor?.href).toBe("blob:file-download");
    expect(clickedAnchor?.download).toBe(regularFile.fileName);
  });

  it.each([
    {
      label: "folder",
      entry: folder,
      canonicalPath: "conversation-c1/Q1 reports",
      fileName: "Q1 reports.zip",
    },
    {
      label: "Frame package",
      entry: framePackage,
      canonicalPath: "conversation-c1/status",
      fileName: "status.zip",
    },
  ])("starts the $label archive download", async ({
    entry,
    canonicalPath,
    fileName,
  }) => {
    const { result } = renderHook(() =>
      useFileExplorerDownload({
        owner,
        getFileResponse: mockGetFileResponse,
      })
    );

    await act(async () => result.current(entry));

    expect(mockPrepareFolderArchiveDownload).toHaveBeenCalledWith({
      owner,
      canonicalPath,
    });
    expect(clickedAnchor?.href).toBe("https://api.example.com/archive.zip");
    expect(clickedAnchor?.download).toBe(fileName);
    expect(clickedAnchor?.isConnected).toBe(false);
  });

  it("shows an error when the archive preflight fails", async () => {
    const error = new Error("Folder is too large");
    mockPrepareFolderArchiveDownload.mockRejectedValue(error);
    const { result } = renderHook(() =>
      useFileExplorerDownload({
        owner,
        getFileResponse: mockGetFileResponse,
      })
    );

    await act(async () => result.current(folder));

    expect(mockLoggerError).toHaveBeenCalledWith(
      { err: error, canonicalPath: folder.path },
      "Failed to download folder"
    );
    expect(mockSendNotification).toHaveBeenCalledWith({
      type: "error",
      title: "Failed to download the folder.",
      description: "An error occurred while downloading. Please try again.",
    });
  });
});
