import { Spinner } from "@dust-tt/sparkle";
import React from "react";

import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { CenteredState } from "@app/components/assistant/conversation/content_creation/CenteredState";
import { PublicContentCreationHeader } from "@app/components/assistant/conversation/content_creation/PublicContentCreationHeader";
import { formatFilenameForDisplay } from "@app/lib/files";
import { usePublicFrame } from "@app/lib/swr/frames";
import { useUser } from "@app/lib/swr/user";

interface PublicClientExecutableRendererProps {
  fileId: string;
  fileName?: string;
  shareToken: string;
  workspaceId: string;
}

export function PublicClientExecutableRenderer({
  fileId,
  fileName,
  shareToken,
  workspaceId,
}: PublicClientExecutableRendererProps) {
  const { frameContent, isFrameLoading, error } = usePublicFrame({
    shareToken,
  });
  const { user } = useUser({
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });

  const getFileBlob = React.useCallback(
    async (fileId: string): Promise<Blob | null> => {
      const response = await fetch(
        `/api/v1/public/frames/${shareToken}/files/${fileId}`
      );
      if (!response.ok) {
        return null;
      }

      const resBuffer = await response.arrayBuffer();
      return new Blob([resBuffer], {
        type: response.headers.get("Content-Type") ?? undefined,
      });
    },
    [shareToken]
  );

  if (isFrameLoading) {
    return (
      <CenteredState>
        <Spinner size="sm" />
        <span>Loading the frame...</span>
      </CenteredState>
    );
  }

  if (error) {
    return (
      <CenteredState>
        <p className="text-warning-500">Error loading the frame: {error}</p>
      </CenteredState>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PublicContentCreationHeader
        title={formatFilenameForDisplay(fileName ?? "Frame")}
        user={user}
      />

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full">
          <VisualizationActionIframe
            agentConfigurationId={null}
            conversationId={null}
            workspaceId={workspaceId}
            visualization={{
              code: frameContent ?? "",
              complete: true,
              identifier: `viz-${fileId}`,
            }}
            key={`viz-${fileId}`}
            isInDrawer
            isPublic
            getFileBlob={getFileBlob}
          />
        </div>
      </div>
    </div>
  );
}
