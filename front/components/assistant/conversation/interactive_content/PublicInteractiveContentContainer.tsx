import { CenteredState } from "@app/components/assistant/conversation/interactive_content/CenteredState";
import { PublicFrameRenderer } from "@app/components/assistant/conversation/interactive_content/PublicFrameRenderer";
import { UnsupportedContentRenderer } from "@app/components/assistant/conversation/interactive_content/UnsupportedContentRenderer";
import Custom404 from "@app/components/pages/Custom404";
import { usePublicFrame } from "@app/lib/swr/frames";
import {
  frameContentType,
  frameSlideshowContentType,
  frameV2ContentType,
} from "@app/types/files";
import { Spinner } from "@dust-tt/sparkle";

interface PublicInteractiveContentContainerProps {
  shareToken: string;
  // Display name of the Frame, resolved by the share metadata endpoint.
  title: string;
  workspaceId: string;
  vizUrl: string;
  logoUrl?: string | null;
  showSignUpCta?: boolean;
  hideHeader?: boolean;
}

/**
 * Public-specific container for interactive content.
 * Works without authentication, conversation context, or session requirements.
 */
export function PublicInteractiveContentContainer({
  shareToken,
  title,
  workspaceId,
  vizUrl,
  logoUrl,
  showSignUpCta = false,
  hideHeader = false,
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
      case frameSlideshowContentType:
      case frameV2ContentType:
        return (
          <PublicFrameRenderer
            fileId={frameMetadata.sId}
            frameId={
              frameMetadata.contentType === frameV2ContentType
                ? frameMetadata.sId
                : undefined
            }
            title={title}
            shareToken={shareToken}
            workspaceId={workspaceId}
            vizUrl={vizUrl}
            logoUrl={logoUrl}
            showSignUpCta={showSignUpCta}
            hideHeader={hideHeader}
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
      <div className="flex-1 overflow-hidden bg-primary-50">
        {renderContent()}
      </div>
    </div>
  );
}
