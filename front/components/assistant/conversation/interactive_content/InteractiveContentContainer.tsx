import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationSidePanelHeader } from "@app/components/assistant/conversation/ConversationSidePanelHeader";
import { CenteredState } from "@app/components/assistant/conversation/interactive_content/CenteredState";
import { FrameRenderer } from "@app/components/assistant/conversation/interactive_content/FrameRenderer";
import { UnsupportedContentRenderer } from "@app/components/assistant/conversation/interactive_content/UnsupportedContentRenderer";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useFileMetadata } from "@app/lib/swr/files";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import {
  frameContentType,
  frameSlideshowContentType,
  frameV2ContentType,
} from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { Spinner } from "@dust-tt/sparkle";
import { useMemo } from "react";

interface InteractiveContentContainerProps {
  conversation: ConversationWithoutContentType;
  owner: LightWorkspaceType;
}

export function InteractiveContentContainer({
  conversation,
  owner,
}: InteractiveContentContainerProps) {
  const { data: contentHash, closePanel } = useConversationSidePanelContext();
  const { hasFeature } = useFeatureFlags();

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
        <div className="flex h-full flex-col">
          <ConversationSidePanelHeader onClose={closePanel} />
          <CenteredState>
            <Spinner size="sm" />
            <span>Loading frame...</span>
          </CenteredState>
        </div>
      );
    }

    if (isFileMetadataError || !fileMetadata) {
      return (
        <div className="flex h-full flex-col">
          <ConversationSidePanelHeader onClose={closePanel} />
          <CenteredState>
            <p className="text-warning-500">Error loading file metadata</p>
          </CenteredState>
        </div>
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
      case frameSlideshowContentType:
        return (
          <FrameRenderer
            conversation={conversation}
            fileId={contentId}
            projectId={fileMetadata.useCaseMetadata.spaceId ?? null}
            lastEditedByAgentConfigurationId={
              fileMetadata.useCaseMetadata.lastEditedByAgentConfigurationId
            }
            owner={owner}
            contentHash={contentHash}
            renderMode="legacy"
          />
        );

      case frameV2ContentType:
        if (!hasFeature("frames_v2")) {
          return (
            <UnsupportedContentRenderer
              fileName={fileMetadata.fileName}
              contentType={fileMetadata.contentType}
            />
          );
        }

        return (
          <FrameRenderer
            conversation={conversation}
            fileId={contentId}
            projectId={fileMetadata.useCaseMetadata.spaceId ?? null}
            owner={owner}
            contentHash={contentHash}
            renderMode="v2"
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
      <div className="flex-1 overflow-hidden bg-primary-50">
        {renderContent()}
      </div>
    </div>
  );
}
