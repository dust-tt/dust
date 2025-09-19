import { Spinner } from "@dust-tt/sparkle";
import { useMemo } from "react";

import { CenteredState } from "@app/components/assistant/conversation/content_creation/CenteredState";
import { ClientExecutableRenderer } from "@app/components/assistant/conversation/content_creation/ClientExecutableRenderer";
import { UnsupportedContentRenderer } from "@app/components/assistant/conversation/content_creation/UnsupportedContentRenderer";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { useFileMetadata } from "@app/lib/swr/files";
import type {
  ConversationWithoutContentType,
  LightWorkspaceType,
} from "@app/types";
import { clientExecutableContentType } from "@app/types";

interface ContentCreationContainerProps {
  conversation: ConversationWithoutContentType | null;
  owner: LightWorkspaceType;
}

export function ContentCreationContainer({
  conversation,
  owner,
}: ContentCreationContainerProps) {
  const { data: contentHash } = useConversationSidePanelContext();

  const contentId = useMemo(() => {
    if (!contentHash) {
      return null;
    }
    return contentHash.split("@")[0];
  }, [contentHash]);

  const { fileMetadata, isFileMetadataLoading, isFileMetadataError } =
    useFileMetadata({
      fileId: contentId,
      owner,
      // We use the contentHash to invalidate the cache when the content is updated.
      cacheKey: contentHash,
    });

  if (!contentId) {
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
            owner={owner}
            contentHash={contentHash}
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
    <div className="flex h-full w-full">
      <div className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900">
        {renderContent()}
      </div>
    </div>
  );
}
