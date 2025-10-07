import { Spinner } from "@dust-tt/sparkle";

import { CenteredState } from "@app/components/assistant/conversation/content_creation/CenteredState";
import { PublicClientExecutableRenderer } from "@app/components/assistant/conversation/content_creation/PublicClientExecutableRenderer";
import { UnsupportedContentRenderer } from "@app/components/assistant/conversation/content_creation/UnsupportedContentRenderer";
import { usePublicFrame } from "@app/lib/swr/frames";
import Custom404 from "@app/pages/404";
import { clientExecutableContentType } from "@app/types";

interface PublicContentCreationContainerProps {
  shareToken: string;
  workspaceId: string;
}

/**
 * Public-specific container for content creation.
 * Works without authentication, conversation context, or session requirements.
 */
export function PublicContentCreationContainer({
  shareToken,
  workspaceId,
}: PublicContentCreationContainerProps) {
  const { frameMetadata, isFrameLoading, isFrameError } = usePublicFrame({
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

    if (isFrameError || !frameMetadata) {
      return <Custom404 />;
    }

    switch (frameMetadata.contentType) {
      case clientExecutableContentType:
        return (
          <PublicClientExecutableRenderer
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
