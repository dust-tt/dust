import {
  ArrowDownOnSquareIcon,
  Button,
  ExternalLinkIcon,
  Markdown,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useEffect, useState } from "react";

import { clientFetch } from "@app/lib/egress/client";
import type { ProcessedContent } from "@app/lib/file_content_utils";
import { processFileContent } from "@app/lib/file_content_utils";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  getFileDownloadUrl,
  getFileProcessedUrl,
  getFileViewUrl,
  useFileContent,
  useFileSignedUrl,
} from "@app/lib/swr/files";
import type { FileWithCreatorType } from "@app/lib/swr/projects";
import {
  isMarkdownContentType,
  isPdfContentType,
  isSupportedAudioContentType,
  isSupportedDelimitedTextContentType,
} from "@app/types/files";
import type { WorkspaceType } from "@app/types/user";

/**
 * Content types compatible with the external viewer (currently Microsoft Office Online).
 * These files can be previewed using the viewer iframe.
 */
const VIEWER_CONTENT_TYPES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

function isViewerCompatible(contentType: string): boolean {
  return VIEWER_CONTENT_TYPES.includes(
    contentType as (typeof VIEWER_CONTENT_TYPES)[number]
  );
}

type FilePreviewCategory =
  | "pdf"
  | "viewer"
  | "audio"
  | "markdown"
  | "csv"
  | "text";

interface FilePreviewConfig {
  category: FilePreviewCategory;
  needsProcessedVersion: boolean;
  supportsExternalViewer: boolean;
}

function getFilePreviewConfig(contentType: string): FilePreviewConfig {
  if (isPdfContentType(contentType)) {
    return {
      category: "pdf",
      needsProcessedVersion: true,
      supportsExternalViewer: true,
    };
  }

  if (isViewerCompatible(contentType)) {
    return {
      category: "viewer",
      needsProcessedVersion: true,
      supportsExternalViewer: true,
    };
  }

  if (isSupportedAudioContentType(contentType)) {
    return {
      category: "audio",
      needsProcessedVersion: true,
      supportsExternalViewer: false,
    };
  }

  if (isMarkdownContentType(contentType)) {
    return {
      category: "markdown",
      needsProcessedVersion: false,
      supportsExternalViewer: false,
    };
  }

  if (isSupportedDelimitedTextContentType(contentType)) {
    return {
      category: "csv",
      needsProcessedVersion: false,
      supportsExternalViewer: false,
    };
  }

  return {
    category: "text",
    needsProcessedVersion: false,
    supportsExternalViewer: false,
  };
}

function TextContent({ text }: { text: string }) {
  return <Markdown content={text} isStreaming={false} />;
}

function AudioFileRenderer({
  content,
  audioUrl,
}: {
  content: ProcessedContent;
  audioUrl: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <audio controls className="w-full" src={audioUrl}>
        Your browser does not support the audio element.
      </audio>
      {content.text && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-muted-foreground">
            Transcript
          </h4>
          <TextContent text={content.text} />
        </div>
      )}
      {!content.text && (
        <p className="text-sm text-muted-foreground">
          No transcript available.
        </p>
      )}
    </div>
  );
}

interface FileContentRendererProps {
  file: FileWithCreatorType;
  owner: WorkspaceType;
  previewConfig: FilePreviewConfig;
  rawFileContent: string | null;
  processedContent: ProcessedContent | null;
  viewerSignedUrl: string | null;
  viewerSignedUrlError: boolean;
}

function getViewerUrl(signedUrl: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrl)}`;
}

function FileContentRenderer({
  file,
  owner,
  previewConfig,
  rawFileContent,
  processedContent,
  viewerSignedUrl,
  viewerSignedUrlError,
}: FileContentRendererProps) {
  switch (previewConfig.category) {
    case "pdf":
      return (
        <iframe
          src={`${getFileViewUrl(owner, file.sId)}#navpanes=0`}
          className="h-full min-h-[600px] w-full rounded-lg border-0"
          title={file.fileName}
        />
      );

    case "viewer":
      if (viewerSignedUrlError && rawFileContent) {
        return <TextContent text={rawFileContent} />;
      }
      if (viewerSignedUrl) {
        return (
          <iframe
            src={getViewerUrl(viewerSignedUrl)}
            className="h-full min-h-[600px] w-full rounded-lg border-0"
            title={file.fileName}
          />
        );
      }
      return null;

    case "audio":
      return (
        <AudioFileRenderer
          content={processedContent ?? { text: "", format: "audio" }}
          audioUrl={getFileViewUrl(owner, file.sId)}
        />
      );

    case "markdown":
    case "csv":
    case "text":
      if (processedContent) {
        return <TextContent text={processedContent.text} />;
      }
      return null;
  }
}

interface FilePreviewContentProps {
  file: FileWithCreatorType | null;
  owner: WorkspaceType;
  isOpen: boolean;
}

function FilePreviewContent({ file, owner, isOpen }: FilePreviewContentProps) {
  const previewConfig = getFilePreviewConfig(file?.contentType ?? "");

  // Fetch processed content directly (bypasses SWR to avoid caching Response
  // objects whose body can only be read once).
  const [processedText, setProcessedText] = useState<string | null>(null);
  const [isProcessedTextLoaded, setIsProcessedTextLoaded] = useState(false);
  useEffect(() => {
    if (!isOpen || !file || !previewConfig.needsProcessedVersion) {
      return;
    }
    const fileId = file.sId;
    let cancelled = false;
    setProcessedText(null);
    setIsProcessedTextLoaded(false);

    void (async () => {
      const response = await clientFetch(getFileProcessedUrl(owner, fileId), {
        redirect: "manual",
      });
      if (cancelled) {
        return;
      }
      if (response.type !== "opaqueredirect" && response.ok) {
        const text = await response.text();
        if (!cancelled) {
          setProcessedText(text);
        }
      }
      if (!cancelled) {
        setIsProcessedTextLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, file, previewConfig.needsProcessedVersion, owner]);

  const { fileContent: originalContent, error: originalContentError } =
    useFileContent({
      fileId: file?.sId ?? null,
      owner,
      config: {
        disabled: !isOpen || !file || previewConfig.needsProcessedVersion,
      },
    });

  const isViewer = previewConfig.category === "viewer";
  const isPdf = previewConfig.category === "pdf";

  const {
    signedUrl: viewerSignedUrl,
    isLoading: isViewerSignedUrlLoading,
    error: viewerSignedUrlError,
  } = useFileSignedUrl({
    fileId: file?.sId ?? null,
    owner,
    config: { disabled: !isOpen || !file || !isViewer },
  });

  const rawFileContent = previewConfig.needsProcessedVersion
    ? processedText
    : (originalContent ?? null);

  const hasError =
    !previewConfig.needsProcessedVersion && !!originalContentError;
  const isContentLoading =
    isOpen &&
    file &&
    !hasError &&
    !isPdf &&
    !isViewer &&
    (previewConfig.needsProcessedVersion
      ? !isProcessedTextLoaded
      : !rawFileContent);
  const isViewerLoading =
    isOpen && file && isViewer && isViewerSignedUrlLoading;

  const processedContent =
    rawFileContent && file
      ? processFileContent(rawFileContent, file.contentType)
      : null;

  const renderContent = () => {
    if (isContentLoading || isViewerLoading) {
      return <Spinner />;
    }

    if (hasError) {
      return (
        <div className="flex h-48 w-full items-center justify-center text-muted-foreground">
          <p>Unable to preview this file. You can download it instead.</p>
        </div>
      );
    }

    if (!file) {
      return null;
    }

    return (
      <FileContentRenderer
        file={file}
        owner={owner}
        previewConfig={previewConfig}
        rawFileContent={rawFileContent}
        processedContent={processedContent}
        viewerSignedUrl={viewerSignedUrl}
        viewerSignedUrlError={!!viewerSignedUrlError}
      />
    );
  };

  return <SheetContainer>{renderContent()}</SheetContainer>;
}

interface FilePreviewSheetProps {
  owner: WorkspaceType;
  file: FileWithCreatorType | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FilePreviewSheet({
  owner,
  file,
  isOpen,
  onOpenChange,
}: FilePreviewSheetProps) {
  const previewConfig = getFilePreviewConfig(file?.contentType ?? "");
  const isViewer = previewConfig.category === "viewer";

  const { signedUrl: viewerSignedUrl } = useFileSignedUrl({
    fileId: file?.sId ?? null,
    owner,
    config: { disabled: !isOpen || !file || !isViewer },
  });

  const handleDownload = () => {
    if (file) {
      window.open(getFileDownloadUrl(owner, file.sId), "_blank");
    }
  };

  const handleOpenInBrowser = () => {
    if (file) {
      if (isViewer && viewerSignedUrl) {
        window.open(getViewerUrl(viewerSignedUrl), "_blank");
      } else {
        window.open(getFileViewUrl(owner, file.sId), "_blank");
      }
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle
            icon={
              file
                ? getFileTypeIcon(file.contentType, file.fileName)
                : undefined
            }
          >
            <div className="flex w-full items-center gap-2">
              <span className="flex-1 truncate">{file?.fileName}</span>
              {file && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon-xs"
                    icon={ArrowDownOnSquareIcon}
                    tooltip="Download"
                    onClick={handleDownload}
                  />
                  {previewConfig.supportsExternalViewer && (
                    <Button
                      variant="outline"
                      size="icon-xs"
                      icon={ExternalLinkIcon}
                      tooltip="Open in browser"
                      onClick={handleOpenInBrowser}
                    />
                  )}
                </div>
              )}
            </div>
          </SheetTitle>
        </SheetHeader>
        <FilePreviewContent file={file} owner={owner} isOpen={isOpen} />
      </SheetContent>
    </Sheet>
  );
}
