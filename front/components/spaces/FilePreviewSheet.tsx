import {
  ArrowDownOnSquareIcon,
  ButtonsSwitch,
  ButtonsSwitchList,
  ExternalLinkIcon,
  Markdown,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useEffect, useMemo, useState } from "react";

import type { ProcessedContent } from "@app/lib/file_content_utils";
import { processFileContent } from "@app/lib/file_content_utils";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  getFileDownloadUrl,
  getFileViewUrl,
  useFileContent,
  useFileProcessedContent,
  useFileSignedUrl,
} from "@app/lib/swr/files";
import type { FileWithCreatorType } from "@app/lib/swr/projects";
import type { WorkspaceType } from "@app/types";
import {
  isMarkdownContentType,
  isPdfContentType,
  isSupportedAudioContentType,
  isSupportedDelimitedTextContentType,
} from "@app/types/files";

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

type ViewMode = "preview" | "ingested";

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

function TextContent({ text, viewMode }: { text: string; viewMode: ViewMode }) {
  if (viewMode === "ingested") {
    return (
      <pre className="whitespace-pre-wrap break-words text-sm">{text}</pre>
    );
  }
  return <Markdown content={text} isStreaming={false} />;
}

function AudioFileRenderer({
  content,
  viewMode,
  audioUrl,
}: {
  content: ProcessedContent;
  viewMode: ViewMode;
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
          <TextContent text={content.text} viewMode={viewMode} />
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
  viewMode: ViewMode;
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
  viewMode,
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
        return <TextContent text={rawFileContent} viewMode={viewMode} />;
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
          viewMode={viewMode}
          audioUrl={getFileViewUrl(owner, file.sId)}
        />
      );

    case "markdown":
    case "csv":
    case "text":
      if (processedContent) {
        return <TextContent text={processedContent.text} viewMode={viewMode} />;
      }
      return null;
  }
}

interface FilePreviewContentProps {
  file: FileWithCreatorType | null;
  owner: WorkspaceType;
  isOpen: boolean;
  viewMode: ViewMode;
}

function FilePreviewContent({
  file,
  owner,
  isOpen,
  viewMode,
}: FilePreviewContentProps) {
  const [contentCache, setContentCache] = useState<Map<string, string>>(
    new Map()
  );

  const previewConfig = getFilePreviewConfig(file?.contentType ?? "");
  const isCached = file ? contentCache.has(file.sId) : false;

  const { content: processedResponse, isContentLoading: isProcessedLoading } =
    useFileProcessedContent({
      fileId: file?.sId ?? null,
      owner,
      config: {
        disabled:
          !isOpen || !file || !previewConfig.needsProcessedVersion || isCached,
      },
    });

  const { fileContent: originalContent, error: originalContentError } =
    useFileContent({
      fileId: file?.sId ?? null,
      owner,
      config: {
        disabled:
          !isOpen || !file || previewConfig.needsProcessedVersion || isCached,
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

  const textPromiseData = useMemo(() => {
    if (
      isProcessedLoading ||
      !file ||
      !previewConfig.needsProcessedVersion ||
      isCached
    ) {
      return undefined;
    }
    const response = processedResponse();
    if (!response) {
      return undefined;
    }
    const promise = response.text();
    return { promise, fileId: file.sId };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isProcessedLoading,
    file?.sId,
    previewConfig.needsProcessedVersion,
    isCached,
  ]);

  useEffect(() => {
    const extractText = async () => {
      if (textPromiseData) {
        const text = await textPromiseData.promise;
        setContentCache((prev) =>
          new Map(prev).set(textPromiseData.fileId, text)
        );
      }
    };

    void extractText();
  }, [textPromiseData]);

  useEffect(() => {
    if (
      originalContent &&
      file &&
      !previewConfig.needsProcessedVersion &&
      !isCached
    ) {
      setContentCache((prev) => new Map(prev).set(file.sId, originalContent));
    }
  }, [originalContent, file, previewConfig.needsProcessedVersion, isCached]);

  const rawFileContent = file ? (contentCache.get(file.sId) ?? null) : null;

  const hasError =
    !previewConfig.needsProcessedVersion && !!originalContentError;
  const isContentLoading =
    isOpen &&
    file &&
    !isCached &&
    !rawFileContent &&
    !hasError &&
    !isPdf &&
    !isViewer;
  const isViewerLoading =
    isOpen && file && isViewer && isViewerSignedUrlLoading;

  const processedContent =
    rawFileContent && file
      ? processFileContent(rawFileContent, file.contentType)
      : null;

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

    if (viewMode === "ingested") {
      if (!rawFileContent) {
        return <Spinner />;
      }
      return <TextContent text={rawFileContent} viewMode="ingested" />;
    }

    return (
      <FileContentRenderer
        file={file}
        owner={owner}
        viewMode={viewMode}
        previewConfig={previewConfig}
        rawFileContent={rawFileContent}
        processedContent={processedContent}
        viewerSignedUrl={viewerSignedUrl}
        viewerSignedUrlError={!!viewerSignedUrlError}
      />
    );
  };

  return (
    <>
      <SheetContainer>{renderContent()}</SheetContainer>
      <SheetFooter
        leftButtonProps={{
          label: "Download file",
          variant: "outline",
          onClick: handleDownload,
          icon: ArrowDownOnSquareIcon,
        }}
        rightButtonProps={
          previewConfig.supportsExternalViewer
            ? {
                label: "Open in browser",
                variant: "outline",
                onClick: handleOpenInBrowser,
                icon: ExternalLinkIcon,
              }
            : undefined
        }
      />
    </>
  );
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
  const [viewMode, setViewMode] = useState<ViewMode>("preview");

  useEffect(() => {
    if (!isOpen) {
      setViewMode("preview");
    }
  }, [isOpen]);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle
            icon={
              file
                ? getFileTypeIcon(file.contentType, file.fileName)
                : undefined
            }
          >
            <div className="flex items-center gap-3">
              <span className="max-w-[200px] truncate">{file?.fileName}</span>
              {file && (
                <ButtonsSwitchList
                  key={file.sId}
                  defaultValue={viewMode}
                  size="xs"
                >
                  <ButtonsSwitch
                    value="preview"
                    label="Preview"
                    onClick={() => setViewMode("preview")}
                  />
                  <ButtonsSwitch
                    value="ingested"
                    label="Ingested data"
                    onClick={() => setViewMode("ingested")}
                  />
                </ButtonsSwitchList>
              )}
            </div>
          </SheetTitle>
        </SheetHeader>
        <FilePreviewContent
          file={file}
          owner={owner}
          isOpen={isOpen}
          viewMode={viewMode}
        />
      </SheetContent>
    </Sheet>
  );
}
