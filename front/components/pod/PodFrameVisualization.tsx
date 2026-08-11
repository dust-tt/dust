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
      isInDrawer={true}
      isPodEditor={isPodEditor}
      ref={iframeRef}
    />
  );
}
