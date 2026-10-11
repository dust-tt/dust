import { DocumentFrameFallback } from "@app/components/editor/document/DocumentFrame";
import { PodFrameVisualization } from "@app/components/pod/PodFrameVisualization";
import { usePodFrameRenderableContent } from "@app/hooks/usePodFrameRenderableContent";
import { AuthContext } from "@app/lib/auth/AuthContext";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { getFrameFunctionReferenceKind } from "@app/types/api/frame_function_reference";
import { isFrameContentType, stripMimeParameters } from "@app/types/files";
import { parseCanonicalScopedPath } from "@app/types/mount_path";
import type { LightWorkspaceType } from "@app/types/user";
import { Spinner } from "@dust-tt/sparkle";
import { useContext } from "react";

interface DocumentFrameEmbedProps {
  owner: LightWorkspaceType;
  path: string;
}

/**
 * @cc [owner:tdraier,label:product;security] document-frame-embed-access
 * A Frame embedded in a document MUST load only through the file API from its path, so it shows
 * only to a reader who can read the Frame's file; a path the API refuses or that is not a Frame
 * MUST show as the path. It MUST render as a regular, non-editable Frame, inline, 600px high,
 * with the reader's editor and member status in the Frame's pod for a Frame of a pod.
 */
export function DocumentFrameEmbed({ owner, path }: DocumentFrameEmbedProps) {
  const vizUrl = useContext(AuthContext)?.vizUrl;
  const scope = parseCanonicalScopedPath(path)?.scope;
  const podId = scope?.kind === "canonical-pod" ? scope.id : null;
  const { fileId, fileContent, fileContentType, isLoading, error } =
    usePodFrameRenderableContent({ owner, framePath: path });
  const { spaceInfo: podInfo, isSpaceInfoLoading } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: podId,
    disabled: podId === null,
  });

  if (isLoading || isSpaceInfoLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  const contentType = fileContentType
    ? stripMimeParameters(fileContentType)
    : null;
  if (
    error ||
    !vizUrl ||
    !fileId ||
    !fileContent ||
    !contentType ||
    !isFrameContentType(contentType)
  ) {
    return <DocumentFrameFallback path={path} />;
  }

  return (
    <div className="h-[600px] overflow-hidden rounded-xl ring-1 ring-border/60">
      <PodFrameVisualization
        owner={owner}
        spaceId={podId ?? undefined}
        conversationId={
          scope?.kind === "canonical-conversation" ? scope.id : null
        }
        fileContent={fileContent}
        vizUrl={vizUrl}
        identifier={`viz-document-frame-${fileId}`}
        isPodEditor={podInfo?.isEditor}
        isPodMember={podInfo?.isMember}
        frameId={
          getFrameFunctionReferenceKind(contentType) === "v2"
            ? fileId
            : undefined
        }
        framePath={path}
      />
    </div>
  );
}
