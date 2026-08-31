import { useFileContent, useFileIdFromPath } from "@app/lib/swr/files";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Load a Pod Frame's renderable content from its source mount path.
 *
 * Pod metadata (pinned banner / frame tabs) stores the source path. Published
 * Frames keep their built bundle as the FileResource's processed version, so we
 * resolve path → fileId and fetch via `?action=view` (getRenderableVersion)
 * rather than reading the raw mount with `/files/path/...`.
 */
export function usePodFrameRenderableContent({
  owner,
  framePath,
  disabled,
}: {
  owner: LightWorkspaceType;
  framePath: string | null | undefined;
  disabled?: boolean;
}) {
  const isDisabled = disabled || !framePath;

  const { fileId, isFileIdLoading, isFileIdNotFound, fileIdError } =
    useFileIdFromPath({
      owner,
      filePath: framePath,
      disabled: isDisabled,
    });

  const {
    fileContent,
    isFileContentLoading,
    error: fileContentError,
    mutateFileContent,
  } = useFileContent({
    fileId,
    owner,
    config: { disabled: isDisabled || !fileId },
  });

  return {
    fileId,
    fileContent: fileContent ?? null,
    isLoading:
      !isDisabled && (isFileIdLoading || (!!fileId && isFileContentLoading)),
    isNotFound: isFileIdNotFound,
    error: fileIdError ?? fileContentError,
    /**
     * Revalidates the Frame's content. Needed when the Frame is rebuilt in place: the path and the
     * fileId are unchanged, so nothing else invalidates the cached bundle.
     */
    mutateFrameContent: mutateFileContent,
  };
}
