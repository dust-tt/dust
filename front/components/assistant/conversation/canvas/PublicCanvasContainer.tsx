import { Spinner } from "@dust-tt/sparkle";

import { CenteredState } from "@app/components/assistant/conversation/canvas/CenteredState";
import { PublicClientExecutableRenderer } from "@app/components/assistant/conversation/canvas/PublicClientExecutableRenderer";
import { UnsupportedContentRenderer } from "@app/components/assistant/conversation/canvas/UnsupportedContentRenderer";
import { usePublicFile } from "@app/lib/swr/files";
import Custom404 from "@app/pages/404";
import { clientExecutableContentType } from "@app/types";

interface PublicCanvasContainerProps {
  shareToken: string;
}

/**
 * Public-specific container for canvas.
 * Works without authentication, conversation context, or session requirements.
 */
export function PublicCanvasContainer({
  shareToken,
}: PublicCanvasContainerProps) {
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
          />
        );

      default:
        return (
          <UnsupportedContentRenderer
            fileName={fileMetadata.fileName}
            fileId={fileMetadata.sId}
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
