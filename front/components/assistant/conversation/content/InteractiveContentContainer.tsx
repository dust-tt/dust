import { Spinner } from "@dust-tt/sparkle";

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
  const { contentId } = useInteractiveContentContext();
  const { fileMetadata, isFileMetadataLoading, isFileMetadataError } =
    useFileMetadata({
      fileId: contentId,
      owner,
    });

  if (!isOpen || !contentId) {
    return null;
  }

  const renderContent = () => {
    if (isFileMetadataLoading) {
      return (
        <div className="flex items-center justify-center p-8">
          <Spinner size="sm" />
          <span className="ml-2">Loading file...</span>
        </div>
      );
    }

    if (isFileMetadataError || !fileMetadata) {
      return (
        <div className="p-4 text-red-600">
          <p>Error loading file metadata</p>
        </div>
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
    <div className="flex h-full w-full flex-col bg-gray-50">
      {/* Content */}
      <div className="flex-1 overflow-hidden">{renderContent()}</div>
    </div>
  );
}
