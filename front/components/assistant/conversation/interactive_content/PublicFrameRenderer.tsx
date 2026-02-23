import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { CenteredState } from "@app/components/assistant/conversation/interactive_content/CenteredState";
import { PublicInteractiveContentHeader } from "@app/components/assistant/conversation/interactive_content/PublicInteractiveContentHeader";
import { DUST_HAS_SESSION, hasSessionIndicator } from "@app/lib/cookies";
import { formatFilenameForDisplay } from "@app/lib/files";
import { usePublicFrame } from "@app/lib/swr/frames";
import { useUser } from "@app/lib/swr/user";
import { Spinner } from "@dust-tt/sparkle";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React from "react";
import { useCookies } from "react-cookie";

interface PublicFrameRendererProps {
  fileId: string;
  fileName?: string;
  shareToken: string;
  workspaceId: string;
}

export function PublicFrameRenderer({
  fileId,
  fileName,
  shareToken,
  workspaceId,
}: PublicFrameRendererProps) {
  const { conversationUrl, isFrameLoading, error, accessToken } =
    usePublicFrame({
      shareToken,
    });

  const [cookies] = useCookies([DUST_HAS_SESSION]);
  const hasSession = hasSessionIndicator(cookies[DUST_HAS_SESSION]);

  const { user } = useUser({
    revalidateOnFocus: false,
    revalidateIfStale: false,
    disabled: !hasSession,
  });

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
      <PublicInteractiveContentHeader
        title={formatFilenameForDisplay(fileName ?? "Frame")}
        user={user}
        conversationUrl={conversationUrl}
      />

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full">
          <VisualizationActionIframe
            agentConfigurationId={null}
            conversationId={null}
            workspaceId={workspaceId}
            visualization={{
              accessToken,
              complete: true,
              identifier: `viz-${fileId}`,
            }}
            key={`viz-${fileId}`}
            isInDrawer
            isPublic
          />
        </div>
      </div>
    </div>
  );
}
