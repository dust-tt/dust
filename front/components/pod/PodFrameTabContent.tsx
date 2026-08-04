import { AuthenticatedVisualizationActionIframe } from "@app/components/assistant/conversation/actions/AuthenticatedVisualizationActionIframe";
import { useAuth } from "@app/lib/auth/AuthContext";
import {
  getFilePathContentApiPath,
  useFileContentByUrl,
} from "@app/lib/swr/files";
import type { RichSpaceType } from "@app/types/api/spaces";
import type { PodFrameTab } from "@app/types/pod_frame_tab";
import type { WorkspaceType } from "@app/types/user";
import { Spinner } from "@dust-tt/sparkle";
import { useMemo, useRef } from "react";

interface PodFrameTabContentProps {
  owner: WorkspaceType;
  podInfo: RichSpaceType;
  tab: PodFrameTab;
}

export function PodFrameTabContent({
  owner,
  podInfo,
  tab,
}: PodFrameTabContentProps) {
  const { vizUrl } = useAuth();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const contentUrl = useMemo(
    () => getFilePathContentApiPath(owner, tab.path),
    [owner, tab.path]
  );

  const { fileContent, isNotFound, isFileContentLoading } = useFileContentByUrl(
    {
      url: contentUrl,
    }
  );

  if (isFileContentLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isNotFound || !fileContent || !vizUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        This frame is no longer available in the Pod files.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden p-2">
      <div className="h-full overflow-hidden rounded-xl ring-1 ring-border/60">
        <AuthenticatedVisualizationActionIframe
          agentConfigurationId={null}
          workspaceId={owner.sId}
          vizUrl={vizUrl}
          visualization={{
            code: fileContent,
            complete: true,
            identifier: `viz-frame-tab-${tab.path}`,
          }}
          conversationId={null}
          spaceId={podInfo.sId}
          isInDrawer={true}
          ref={iframeRef}
        />
      </div>
    </div>
  );
}
