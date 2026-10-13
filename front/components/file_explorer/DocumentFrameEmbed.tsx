import { DocumentFrameFallback } from "@app/components/editor/document/DocumentFrame";
import { PodFrameVisualization } from "@app/components/pod/PodFrameVisualization";
import { useRenderableFrameAtPath } from "@app/hooks/useRenderableFrameAtPath";
import { AuthContext } from "@app/lib/auth/AuthContext";
import { useSpaceInfo } from "@app/lib/swr/spaces";
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
  const { frame, isLoading } = useRenderableFrameAtPath({
    owner,
    framePath: path,
  });
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

  if (!vizUrl || !frame) {
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
        fileContent={frame.fileContent}
        vizUrl={vizUrl}
        identifier={`viz-document-frame-${frame.fileId}`}
        isPodEditor={podInfo?.isEditor}
        isPodMember={podInfo?.isMember}
        frameId={frame.frameId}
        framePath={path}
      />
    </div>
  );
}
