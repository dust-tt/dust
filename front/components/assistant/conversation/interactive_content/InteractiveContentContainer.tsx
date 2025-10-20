import { Spinner } from "@dust-tt/sparkle";
import { useMemo } from "react";

import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { CenteredState } from "@app/components/assistant/conversation/interactive_content/CenteredState";
import { FrameRenderer } from "@app/components/assistant/conversation/interactive_content/FrameRenderer";
import { UnsupportedContentRenderer } from "@app/components/assistant/conversation/interactive_content/UnsupportedContentRenderer";
import { useFileMetadata } from "@app/lib/swr/files";
import type {
  ConversationWithoutContentType,
  LightWorkspaceType,
} from "@app/types";
import { frameContentType } from "@app/types";

interface InteractiveContentContainerProps {
  conversation: ConversationWithoutContentType;
  owner: LightWorkspaceType;
}

export function InteractiveContentContainer({
  conversation,
  owner,
}: InteractiveContentContainerProps) {
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
          <span>Loading frame...</span>
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
      case frameContentType:
        return (
          <FrameRenderer
            conversation={conversation}
            fileId={contentId}
            lastEditedByAgentConfigurationId={
              fileMetadata.useCaseMetadata.lastEditedByAgentConfigurationId
            }
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
