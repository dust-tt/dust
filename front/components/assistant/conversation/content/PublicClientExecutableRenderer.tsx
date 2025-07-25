import { Spinner } from "@dust-tt/sparkle";

import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { CenteredState } from "@app/components/assistant/conversation/content/CenteredState";
import { usePublicFile } from "@app/lib/swr/files";

import { InteractiveContentHeader } from "./InteractiveContentHeader";

interface PublicClientExecutableRendererProps {
  fileId: string;
  fileName?: string;
  shareToken: string;
}

export function PublicClientExecutableRenderer({
  fileId,
  fileName,
  shareToken,
}: PublicClientExecutableRendererProps) {
  const { fileContent, isFileLoading, isFileError } = usePublicFile({
    shareToken,
    includeContent: true,
  });

  if (isFileLoading) {
    return (
      <CenteredState>
        <Spinner size="sm" />
        <span>Loading interactive content...</span>
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
      <InteractiveContentHeader
        title={fileName || "Client Executable"}
        subtitle={fileId}
      />

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full">
          <VisualizationActionIframe
            agentConfigurationId={null}
            conversationId={null}
            workspaceId={null}
            visualization={{
              code: fileContent ?? "",
              complete: true,
              identifier: `viz-${fileId}`,
            }}
            key={`viz-${fileId}`}
            isInDrawer={true}
          />
        </div>
      </div>
    </div>
  );
}
