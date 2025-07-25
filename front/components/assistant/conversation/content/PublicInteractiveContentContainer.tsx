import { Button, LoginIcon, Spinner } from "@dust-tt/sparkle";

import { PublicWebsiteLogo } from "@app/components/home/LandingLayout";
import UTMButton from "@app/components/UTMButton";
import { usePublicFile } from "@app/lib/swr/files";
import Custom404 from "@app/pages/404";
import { clientExecutableContentType } from "@app/types";

import { CenteredState } from "./CenteredState";
import { PublicClientExecutableRenderer } from "./PublicClientExecutableRenderer";
import { UnsupportedContentRenderer } from "./UnsupportedContentRenderer";

interface PublicInteractiveContentContainerProps {
  shareToken: string;
}

/**
 * Public-specific container for interactive content.
 * Works without authentication, conversation context, or session requirements.
 */
export function PublicInteractiveContentContainer({
  shareToken,
}: PublicInteractiveContentContainerProps) {
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
      <PublicInteractiveContentHeader />
      <div className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900">
        {renderContent()}
      </div>
    </div>
  );
}

function PublicInteractiveContentHeader() {
  return (
    <div className="flex w-full items-center p-6">
      <PublicWebsiteLogo />
      <div className="flex flex-grow justify-end gap-4">
        <Button
          variant="highlight"
          size="sm"
          label="Sign in"
          icon={LoginIcon}
          href={"/api/workos/login"}
        />
        <UTMButton
          href="/home/contact"
          className="hidden xs:inline-flex"
          variant="outline"
          size="sm"
          label="Request a demo"
        />
      </div>
    </div>
  );
}
