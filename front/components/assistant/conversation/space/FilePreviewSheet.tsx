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

import type {
  FilePreviewConfig,
  ProcessedContent,
} from "@app/lib/file_content_utils";
import {
  getFilePreviewConfig,
  processFileContent,
} from "@app/lib/file_content_utils";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  getFileDownloadUrl,
  getFileViewUrl,
  useFileContent,
  useFileProcessedContent,
  useOfficeViewerUrl,
} from "@app/lib/swr/files";
import type { ProjectFileType } from "@app/lib/swr/projects";
import type { WorkspaceType } from "@app/types";

type ViewMode = "preview" | "ingested";

function TextContent({ text, viewMode }: { text: string; viewMode: ViewMode }) {
  if (viewMode === "ingested") {
    return (
      <pre className="whitespace-pre-wrap break-words text-sm">{text}</pre>
    );
  }
  return <Markdown content={text} isStreaming={false} />;
}

function FileContentRenderer({
  content,
  viewMode,
  audioUrl,
}: {
  content: ProcessedContent;
  viewMode: ViewMode;
  audioUrl?: string;
}) {
  if (content.format === "audio") {
    return (
      <div className="flex flex-col gap-4">
        {audioUrl && (
          <audio controls className="w-full" src={audioUrl}>
            Your browser does not support the audio element.
          </audio>
        )}
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

  return <TextContent text={content.text} viewMode={viewMode} />;
}

function FilePreviewContent({
  file,
  owner,
  previewConfig,
  viewMode,
  isLoading,
  hasError,
  rawFileContent,
  processedContent,
  officeViewerUrl,
  officeViewerError,
}: {
  file: ProjectFileType | null;
  owner: WorkspaceType;
  previewConfig: FilePreviewConfig;
  viewMode: ViewMode;
  isLoading: boolean;
  hasError: boolean;
  rawFileContent: string | null;
  processedContent: ProcessedContent | null;
  officeViewerUrl: string | null;
  officeViewerError: boolean;
}) {
  if (isLoading) {
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

  switch (previewConfig.category) {
    case "pdf":
      return (
        <iframe
          src={`${getFileViewUrl(owner, file.sId)}#navpanes=0`}
          className="h-full min-h-[600px] w-full rounded-lg border-0"
          title={file.fileName}
        />
      );

    case "office":
      if (officeViewerError && rawFileContent) {
        return <TextContent text={rawFileContent} viewMode={viewMode} />;
      }
      if (officeViewerUrl) {
        return (
          <iframe
            src={officeViewerUrl}
            className="h-full min-h-[600px] w-full rounded-lg border-0"
            title={file.fileName}
          />
        );
      }
      return null;

    case "audio":
      return (
        <FileContentRenderer
          content={processedContent ?? { text: "", format: "audio" }}
          viewMode={viewMode}
          audioUrl={getFileViewUrl(owner, file.sId)}
        />
      );

    case "markdown":
    case "csv":
    case "text":
      if (processedContent) {
        return (
          <FileContentRenderer content={processedContent} viewMode={viewMode} />
        );
      }
      return null;
  }
}

interface FilePreviewSheetProps {
  owner: WorkspaceType;
  file: ProjectFileType | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FilePreviewSheet({
  owner,
  file,
  isOpen,
  onOpenChange,
}: FilePreviewSheetProps) {
  const [contentCache, setContentCache] = useState<Map<string, string>>(
    new Map()
  );
  const [viewMode, setViewMode] = useState<ViewMode>("preview");

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

  useEffect(() => {
    if (!isOpen) {
      setViewMode("preview");
    }
  }, [isOpen]);

  const isOffice = previewConfig.category === "office";
  const isPdf = previewConfig.category === "pdf";

  const {
    viewerUrl: officeViewerUrl,
    isLoading: isOfficeViewerLoading,
    error: officeViewerError,
  } = useOfficeViewerUrl({
    fileId: file?.sId ?? null,
    owner,
    config: { disabled: !isOpen || !file || !isOffice },
  });

  const hasError =
    !previewConfig.needsProcessedVersion && !!originalContentError;
  const isContentLoading =
    isOpen &&
    file &&
    !isCached &&
    !rawFileContent &&
    !hasError &&
    !isPdf &&
    !isOffice;
  const isOfficeLoading = isOpen && file && isOffice && isOfficeViewerLoading;

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
      if (isOffice && officeViewerUrl) {
        window.open(officeViewerUrl, "_blank");
      } else {
        window.open(getFileViewUrl(owner, file.sId), "_blank");
      }
    }
  };

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
        <SheetContainer>
          <FilePreviewContent
            file={file}
            owner={owner}
            previewConfig={previewConfig}
            viewMode={viewMode}
            isLoading={!!isContentLoading || !!isOfficeLoading}
            hasError={hasError}
            rawFileContent={rawFileContent}
            processedContent={processedContent}
            officeViewerUrl={officeViewerUrl}
            officeViewerError={!!officeViewerError}
          />
        </SheetContainer>
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
      </SheetContent>
    </Sheet>
  );
}
