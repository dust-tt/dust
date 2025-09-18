import { Spinner } from "@dust-tt/sparkle";

import { CenteredState } from "@app/components/assistant/conversation/content_creation/CenteredState";
import { PublicClientExecutableRenderer } from "@app/components/assistant/conversation/content_creation/PublicClientExecutableRenderer";
import { UnsupportedContentRenderer } from "@app/components/assistant/conversation/content_creation/UnsupportedContentRenderer";
import { usePublicFile } from "@app/lib/swr/files";
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
  const { fileMetadata, isFileLoading, isFileError } = usePublicFile({
    shareToken,
  });

  const renderContent = () => {
    if (isFileLoading) {
      return (
        <CenteredState>
          <Spinner size="sm" />
          <span>Loading file...</span>
        </CenteredState>
      );
    }

    if (isFileError || !fileMetadata) {
      return <Custom404 />;
    }

    switch (fileMetadata.contentType) {
      case clientExecutableContentType:
        return (
          <PublicClientExecutableRenderer
            fileId={fileMetadata.sId}
            fileName={fileMetadata.fileName}
            shareToken={shareToken}
            workspaceId={workspaceId}
          />
        );

      default:
        return (
          <UnsupportedContentRenderer
            fileName={fileMetadata.fileName}
            contentType={fileMetadata.contentType}
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
