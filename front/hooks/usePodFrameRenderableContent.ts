import { useFileContent, useFileIdFromPath } from "@app/lib/swr/files";
import { getFrameFunctionReferenceKind } from "@app/types/api/frame_function_reference";
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

  const {
    fileId,
    fileContentType,
    isFileIdLoading,
    isFileIdNotFound,
    fileIdError,
  } = useFileIdFromPath({
    owner,
    filePath: framePath,
    disabled: isDisabled,
  });

  const {
    fileContent,
    isFileContentLoading,
    error: fileContentError,
  } = useFileContent({
    fileId,
    owner,
    config: { disabled: isDisabled || !fileId },
  });
  return {
    fileId,
    fileContent: fileContent ?? null,
    functionReferenceKind: getFrameFunctionReferenceKind(fileContentType),
    isLoading:
      !isDisabled && (isFileIdLoading || (!!fileId && isFileContentLoading)),
    isNotFound: isFileIdNotFound,
    error: fileIdError ?? fileContentError,
  };
}
