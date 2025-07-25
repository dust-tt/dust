import { Spinner } from "@dust-tt/sparkle";

import { CenteredState } from "@app/components/assistant/conversation/content/CenteredState";
import { ClientExecutableRenderer } from "@app/components/assistant/conversation/content/ClientExecutableRenderer";
import { useInteractiveContentContext } from "@app/components/assistant/conversation/content/InteractiveContentContext";
import { UnsupportedContentRenderer } from "@app/components/assistant/conversation/content/UnsupportedContentRenderer";
import { useFileMetadata } from "@app/lib/swr/files";
import type { ConversationType, LightWorkspaceType } from "@app/types";
import { clientExecutableContentType } from "@app/types";

interface InteractiveContentContainerProps {
  conversation: ConversationType | null;
  isOpen: boolean;
  owner: LightWorkspaceType;
}

export function InteractiveContentContainer({
  conversation,
  isOpen,
  owner,
}: InteractiveContentContainerProps) {
  const { contentId, contentHash } = useInteractiveContentContext();
  const { fileMetadata, isFileMetadataLoading, isFileMetadataError } =
    useFileMetadata({
      fileId: contentId,
      owner,
      // We use the contentHash to invalidate the cache when the content is updated.
      cacheKey: contentHash,
    });

  if (!isOpen || !contentId) {
    return null;
  }

  const renderContent = () => {
    if (isFileMetadataLoading) {
      return (
        <CenteredState>
          <Spinner size="sm" />
          <span>Loading file...</span>
        </CenteredState>
      );
    }

    if (isFileMetadataError || !fileMetadata) {
      return (
        <CenteredState>
          <p className="text-warning-500">Error loading file metadata</p>
        </CenteredState>
      );
    }

    if (!conversation) {
      return (
        <UnsupportedContentRenderer
          fileName={fileMetadata.fileName}
          fileId={contentId}
          contentType={fileMetadata.contentType}
        />
      );
    }

    // Render appropriate content based on content type.
    switch (fileMetadata.contentType) {
      case clientExecutableContentType:
        return (
          <ClientExecutableRenderer
            conversation={conversation}
            fileId={contentId}
            fileName={fileMetadata.fileName}
            owner={owner}
          />
        );

      default:
        return (
          <UnsupportedContentRenderer
            fileName={fileMetadata.fileName}
            fileId={contentId}
            contentType={fileMetadata.contentType}
          />
        );
    }
  };

  return (
    <div className="flex h-full w-full">
      <div className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900">
        {renderContent()}
      </div>
    </div>
  );
}
