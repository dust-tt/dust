import { Spinner } from "@dust-tt/sparkle";

import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { CenteredState } from "@app/components/assistant/conversation/content_creation/CenteredState";
import { PublicContentCreationHeader } from "@app/components/assistant/conversation/content_creation/PublicContentCreationHeader";
import { formatFilenameForDisplay } from "@app/lib/files";
import { usePublicFile } from "@app/lib/swr/files";

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
  const { fileContent, isFileLoading, isFileError } = usePublicFile({
    shareToken,
    includeContent: true,
  });

  if (isFileLoading) {
    return (
      <CenteredState>
        <Spinner size="sm" />
        <span>Loading Frame...</span>
      </CenteredState>
    );
  }

  if (isFileError) {
    return (
      <CenteredState>
        <p className="text-warning-500">Error loading file: {isFileError}</p>
      </CenteredState>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PublicContentCreationHeader
        title={formatFilenameForDisplay(fileName ?? "Frame")}
      />

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full">
          <VisualizationActionIframe
            agentConfigurationId={null}
            conversationId={null}
            workspaceId={workspaceId}
            visualization={{
              code: fileContent ?? "",
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
