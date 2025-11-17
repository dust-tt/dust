import { Spinner } from "@dust-tt/sparkle";

import { CenteredState } from "@app/components/assistant/conversation/interactive_content/CenteredState";
import { PublicFrameRenderer } from "@app/components/assistant/conversation/interactive_content/PublicFrameRenderer";
import { UnsupportedContentRenderer } from "@app/components/assistant/conversation/interactive_content/UnsupportedContentRenderer";
import { usePublicFrame } from "@app/lib/swr/frames";
import Custom404 from "@app/pages/404";
import { frameContentType } from "@app/types";

interface PublicInteractiveContentContainerProps {
  shareToken: string;
  workspaceId: string;
}

/**
 * Public-specific container for interactive content.
 * Works without authentication, conversation context, or session requirements.
 */
export function PublicInteractiveContentContainer({
  shareToken,
  workspaceId,
}: PublicInteractiveContentContainerProps) {
  const { frameMetadata, isFrameLoading, error } = usePublicFrame({
    shareToken,
  });

  const renderContent = () => {
    if (isFrameLoading) {
      return (
        <CenteredState>
          <Spinner size="sm" />
          <span>Loading frame...</span>
        </CenteredState>
      );
    }

    if (error || !frameMetadata) {
      return <Custom404 />;
    }

    switch (frameMetadata.contentType) {
      case frameContentType:
        return (
          <PublicFrameRenderer
            fileId={frameMetadata.sId}
            fileName={frameMetadata.fileName}
            shareToken={shareToken}
            workspaceId={workspaceId}
          />
        );

      default:
        return (
          <UnsupportedContentRenderer
            fileName={frameMetadata.fileName}
            contentType={frameMetadata.contentType}
          />
        );
    }
  };

  return (
    <div className="flex w-full flex-col">
      <div className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900">
        {renderContent()}
      </div>
    </div>
  );
}
