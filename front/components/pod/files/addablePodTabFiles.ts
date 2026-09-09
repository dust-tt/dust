import { getFileExplorerPipeline } from "@app/components/file_explorer/fileExplorerPipeline";
import type {
  FileEntry,
  FileExplorerEntry,
  FramePackageEntry,
} from "@app/components/file_explorer/types";
import { isFilePreviewableContentType } from "@app/components/file_explorer/utils";
import type { AddablePodTabFile } from "@app/components/pod/settings/AddPodFileMenu";
import type { FileSystemEntry } from "@app/types/api/file_system/types";
import { frameV2ContentType } from "@app/types/files";

function isAddablePodTabEntry(
  entry: FileExplorerEntry,
  existingTabPaths: ReadonlySet<string>
): entry is FileEntry | FramePackageEntry {
  if (existingTabPaths.has(entry.path)) {
    return false;
  }

  if (entry.kind === "frame_package") {
    return true;
  }

  if (entry.kind !== "file") {
    return false;
  }

  return (
    entry.contentType !== frameV2ContentType &&
    isFilePreviewableContentType(entry.contentType)
  );
}

/**
 * Previewable Pod files (and Frame packages) that are not already pinned as tabs.
 * Mirrors the "Add as Pod tab" eligibility in the Files explorer.
 */
export function listAddablePodTabFiles({
  podFiles,
  existingTabPaths,
  displayFramePackages,
}: {
  podFiles: FileSystemEntry[];
  existingTabPaths: ReadonlySet<string>;
  displayFramePackages: boolean;
}): AddablePodTabFile[] {
  const { entryByRelativePath } = getFileExplorerPipeline({
    activeFilter: "all",
    contentNodes: [],
    currentFolderPath: "",
    displayFramePackages,
    files: podFiles,
    searchQuery: "",
    sortMode: "name-asc",
  });

  return [...entryByRelativePath.values()]
    .filter((entry): entry is FileEntry | FramePackageEntry =>
      isAddablePodTabEntry(entry, existingTabPaths)
    )
    .map((entry) => ({
      path: entry.path,
      fileName: entry.fileName,
      contentType: entry.contentType,
    }))
    .sort((a, b) =>
      a.fileName.localeCompare(b.fileName, undefined, { sensitivity: "base" })
    );
}
