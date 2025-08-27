import { Spinner } from "@dust-tt/sparkle";

import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { CenteredState } from "@app/components/assistant/conversation/canvas/CenteredState";
import { PublicCanvasHeader } from "@app/components/assistant/conversation/canvas/PublicCanvasHeader";
import { formatFilenameForDisplay } from "@app/lib/files";
import { usePublicFile } from "@app/lib/swr/files";

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
        <span>Loading canvas...</span>
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
      <PublicCanvasHeader
        title={formatFilenameForDisplay(fileName ?? "Canvas")}
      />

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full">
          <VisualizationActionIframe
            agentConfigurationId={null}
            conversationId={null}
            workspace={null}
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
