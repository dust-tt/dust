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
  /** Scoped path of the Frame, so one inside an app folder can call its functions by bare name. */
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
      framePath={framePath}
      isInDrawer={true}
      isPodEditor={isPodEditor}
      ref={iframeRef}
    />
  );
}
