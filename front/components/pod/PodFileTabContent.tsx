import { PodFileTabPreview } from "@app/components/pod/PodFileTabPreview";
import { PodFrameVisualization } from "@app/components/pod/PodFrameVisualization";
import { usePodFrameRenderableContent } from "@app/hooks/usePodFrameRenderableContent";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useFileMetadataFromPath } from "@app/lib/swr/files";
import { getFrameFunctionReferenceKind } from "@app/types/api/frame_function_reference";
import type { RichSpaceType } from "@app/types/api/spaces";
import { isFrameContentType, stripMimeParameters } from "@app/types/files";
import type { PodFileTab } from "@app/types/pod_file_tab";
import type { WorkspaceType } from "@app/types/user";
import { Spinner } from "@dust-tt/sparkle";

interface PodFileTabContentProps {
  owner: WorkspaceType;
  podInfo: RichSpaceType;
  tab: PodFileTab;
}

export function PodFileTabContent({
  owner,
  podInfo,
  tab,
}: PodFileTabContentProps) {
  const { vizUrl } = useAuth();
  const { metadata, isFileMetadataLoading, isFileMetadataNotFound } =
    useFileMetadataFromPath({
      owner,
      filePath: tab.path,
    });

  const isFrame =
    !!metadata?.contentType &&
    isFrameContentType(stripMimeParameters(metadata.contentType));

  // Frames still load via the processed renderable bundle; other previewable
  // files reuse the shared file preview stack (including markdown edit).
  if (isFileMetadataLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isFileMetadataNotFound) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        This file is no longer available in the Pod files.
      </div>
    );
  }

  if (!isFrame) {
    return (
      <PodFileTabPreview
        owner={owner}
        filePath={tab.path}
        canEdit={podInfo.isEditor}
      />
    );
  }

  return (
    <PodFileTabVisualization
      owner={owner}
      podInfo={podInfo}
      framePath={tab.path}
      vizUrl={vizUrl}
    />
  );
}

function PodFileTabVisualization({
  owner,
  podInfo,
  framePath,
  vizUrl,
}: {
  owner: WorkspaceType;
  podInfo: RichSpaceType;
  framePath: string;
  vizUrl: string | null;
}) {
  const { fileId, fileContent, fileContentType, isLoading, isNotFound } =
    usePodFrameRenderableContent({
      owner,
      framePath,
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
          isPodEditor={podInfo.isEditor}
          isPodMember={podInfo.isMember}
          frameId={
            getFrameFunctionReferenceKind(fileContentType) === "v2"
              ? fileId
              : undefined
          }
          framePath={framePath}
        />
      </div>
    </div>
  );
}
