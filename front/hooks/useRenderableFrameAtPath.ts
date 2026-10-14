import { usePodFrameRenderableContent } from "@app/hooks/usePodFrameRenderableContent";
import { getFrameFunctionReferenceKind } from "@app/types/api/frame_function_reference";
import { isFrameContentType, stripMimeParameters } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";

interface RenderableFrame {
  fileId: string;
  fileContent: string;
  frameId: string | undefined;
}

/**
 * @cc [owner:tdraier,label:product] renderable-frame-at-path
 * `frame` MUST be null unless the file at `framePath` loaded and its content type, MIME
 * parameters aside, is a Frame's; `frameId` MUST be the file id for a v2 Frame only.
 */
export function useRenderableFrameAtPath({
  owner,
  framePath,
}: {
  owner: LightWorkspaceType;
  framePath: string;
}): { frame: RenderableFrame | null; isLoading: boolean } {
  const { fileId, fileContent, fileContentType, isLoading, isNotFound, error } =
    usePodFrameRenderableContent({ owner, framePath });

  const contentType = fileContentType
    ? stripMimeParameters(fileContentType)
    : null;
  const frame =
    !error &&
    !isNotFound &&
    fileId &&
    fileContent &&
    contentType &&
    isFrameContentType(contentType)
      ? {
          fileId,
          fileContent,
          frameId:
            getFrameFunctionReferenceKind(contentType) === "v2"
              ? fileId
              : undefined,
        }
      : null;

  return { frame, isLoading };
}
