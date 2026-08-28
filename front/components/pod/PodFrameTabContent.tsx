import { PodFrameVisualization } from "@app/components/pod/PodFrameVisualization";
import { usePodFrameRenderableContent } from "@app/hooks/usePodFrameRenderableContent";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { RichSpaceType } from "@app/types/api/spaces";
import { frameV2ContentType } from "@app/types/files";
import type { PodFrameTab } from "@app/types/pod_frame_tab";
import type { WorkspaceType } from "@app/types/user";
import { Spinner } from "@dust-tt/sparkle";

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
  const { fileId, fileContent, contentType, isLoading, isNotFound } =
    usePodFrameRenderableContent({
      owner,
      framePath: tab.path,
    });

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isNotFound || !fileId || !fileContent || !vizUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        This frame is no longer available in the Pod files.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden p-2">
      <div className="h-full overflow-hidden rounded-xl ring-1 ring-border/60">
        <PodFrameVisualization
          owner={owner}
          spaceId={podInfo.sId}
          fileContent={fileContent}
          vizUrl={vizUrl}
          identifier={`viz-frame-tab-${fileId}`}
          frameId={contentType === frameV2ContentType ? fileId : undefined}
          isPodEditor={podInfo.isEditor}
          isPodMember={podInfo.isMember}
          framePath={tab.path}
        />
      </div>
    </div>
  );
}
