import { AuthenticatedVisualizationActionIframe } from "@app/components/assistant/conversation/actions/AuthenticatedVisualizationActionIframe";
import type { LightWorkspaceType } from "@app/types/user";
import { useRef } from "react";

interface PodFrameVisualizationProps {
  owner: LightWorkspaceType;
  spaceId: string;
  fileContent: string;
  vizUrl: string;
  identifier: string;
  isPodEditor?: boolean;
  isPodMember?: boolean;
  /** Stable FileResource identity for Frame v2; omitted for legacy Frames. */
  frameId?: string;
  /** Canonical path of the Frame file or manifest. */
  framePath?: string | null;
}

/**
 * Shared viz iframe used by the Pod pinned banner and Pod frame tabs.
 * Expects already-fetched renderable content (published bundle when available).
 */
export function PodFrameVisualization({
  owner,
  spaceId,
  fileContent,
  vizUrl,
  identifier,
  isPodEditor,
  isPodMember,
  frameId,
  framePath,
}: PodFrameVisualizationProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  return (
    <AuthenticatedVisualizationActionIframe
      agentConfigurationId={null}
      workspaceId={owner.sId}
      vizUrl={vizUrl}
      visualization={{
        code: fileContent,
        complete: true,
        identifier,
      }}
      conversationId={null}
      spaceId={spaceId}
      framePackageRoot={
        framePath && framePath.includes("/")
          ? framePath.slice(0, framePath.lastIndexOf("/"))
          : null
      }
      frameId={frameId}
      isInDrawer={true}
      isPodEditor={isPodEditor}
      isPodMember={isPodMember}
      ref={iframeRef}
    />
  );
}
