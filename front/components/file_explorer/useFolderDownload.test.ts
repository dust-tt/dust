import type {
  FolderDownloadEntry,
  FramePackageEntry,
} from "@app/components/file_explorer/types";
import { useFolderDownload } from "@app/components/file_explorer/useFolderDownload";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { frameV2ContentType } from "@app/types/files";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrepareFolderArchiveDownload = vi.fn();
const mockSendNotification = vi.fn();
const mockLoggerError = vi.fn();

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
const folder: FolderDownloadEntry = {
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

describe("useFolderDownload", () => {
  let clickedAnchor: HTMLAnchorElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    clickedAnchor = undefined;
    mockPrepareFolderArchiveDownload.mockResolvedValue(
      "https://api.example.com/archive.zip"
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clickedAnchor = this;
    });
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
    const { result } = renderHook(() => useFolderDownload({ owner }));

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
    const { result } = renderHook(() => useFolderDownload({ owner }));

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
