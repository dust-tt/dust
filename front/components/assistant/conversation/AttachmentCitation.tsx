import {
  ActionVolumeUpIcon,
  Citation,
  CitationClose,
  CitationDescription,
  CitationIcons,
  CitationImage,
  CitationTitle,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DocumentIcon,
  DoubleIcon,
  DoubleQuotesIcon,
  FolderIcon,
  Icon,
  ImageIcon,
  Spinner,
  TableIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import React, { useEffect, useMemo, useState } from "react";

import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { useFileContent, useFileProcessedContent } from "@app/lib/swr/files";
import type {
  ContentFragmentType,
  LightWorkspaceType,
  SupportedContentFragmentType,
  SupportedFileContentType,
} from "@app/types";
import { isSupportedImageContentType } from "@app/types";
import {
  assertNever,
  isContentNodeContentFragment,
  isFileContentFragment,
} from "@app/types";

import {
  getDisplayDateFromPastedFileId,
  getDisplayNameFromPastedFileId,
  isPastedFile,
} from "./input_bar/pasted_utils";

export type FileAttachment = {
  type: "file";
  id: string;
  title: string;
  contentType: SupportedFileContentType;
  isUploading: boolean;
  onRemove: () => void;
  description?: string;
  sourceUrl?: string;
};

export type NodeAttachment = {
  type: "node";
  id: string;
  title: string;
  spaceName: string;
  spaceIcon: React.ComponentType;
  visual: React.ReactNode;
  path: string;
  onRemove: () => void;
  url: string | null;
};

export type Attachment = FileAttachment | NodeAttachment;

interface BaseAttachmentCitation {
  id: string;
  attachmentCitationType: "fragment" | "inputBar";
  title: string;
  sourceUrl?: string | null;
  visual: React.ReactNode;
  onRemove?: () => void;
}

interface FileAttachmentCitation extends BaseAttachmentCitation {
  type: "file";

  contentType: SupportedContentFragmentType;
  description?: string;
  fileId: string | null;
  isUploading?: boolean;
}

interface NodeAttachmentCitation extends BaseAttachmentCitation {
  type: "node";

  path?: string;
  spaceIcon?: React.ComponentType;
  spaceName: string;
}

export type AttachmentCitation =
  | FileAttachmentCitation
  | NodeAttachmentCitation;

interface AttachmentCitationProps {
  owner: LightWorkspaceType;
  attachmentCitation: AttachmentCitation;
  fileUploaderService: FileUploaderService;
}
const isTextualContentType = (attachmentCitation: AttachmentCitation) => {
  if (attachmentCitation.type !== "file") {
    return false;
  }
  const ct = attachmentCitation.contentType;
  return (
    ct.startsWith("text/") ||
    ct === "application/json" ||
    ct === "application/xml" ||
    ct === "application/vnd.dust.section.json"
  );
};

const isAudioContentType = (attachmentCitation: AttachmentCitation) => {
  if (attachmentCitation.type !== "file") {
    return false;
  }
  const ct = attachmentCitation.contentType;
  return ct.startsWith("audio/");
};

function getContentTypeIcon(
  contentType: string | undefined
): React.ComponentType {
  if (!contentType) {
    return DocumentIcon;
  }
  const isImageType = contentType.startsWith("image/");
  if (isImageType) {
    return ImageIcon;
  }
  const isAudioType = contentType.startsWith("audio/");
  if (isAudioType) {
    return ActionVolumeUpIcon;
  }
  if (isPastedFile(contentType)) {
    return DoubleQuotesIcon;
  }
  return DocumentIcon;
}

export function AttachmentCitation({
  owner,
  attachmentCitation,
  fileUploaderService,
}: AttachmentCitationProps) {
  const [viewerOpen, setViewerOpen] = useState(false);

  const tooltipContent =
    attachmentCitation.type === "file" ? (
      attachmentCitation.title
    ) : (
      <div className="flex flex-col gap-1">
        <div className="font-bold">{attachmentCitation.title}</div>
        <div className="flex gap-1 pt-1 text-sm">
          <Icon visual={attachmentCitation.spaceIcon} />
          <p>{attachmentCitation.spaceName}</p>
        </div>
        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          {attachmentCitation.path}
        </div>
      </div>
    );

  const previewImageUrl =
    attachmentCitation.type === "file" &&
    isSupportedImageContentType(attachmentCitation.contentType)
      ? `${attachmentCitation.sourceUrl}?action=view`
      : undefined;

  const isLoading =
    attachmentCitation.type === "file" && attachmentCitation.isUploading;

  const canOpenInDialog =
    attachmentCitation.type === "file" &&
    (isTextualContentType(attachmentCitation) ||
      isAudioContentType(attachmentCitation));

  const dialogOrDownloadProps = canOpenInDialog
    ? {
        onClick: (e: React.MouseEvent<HTMLDivElement>) => {
          e.preventDefault();
          setViewerOpen(true);
        },
      }
    : {
        href: attachmentCitation.sourceUrl ?? undefined,
      };

  return (
    <>
      <Tooltip
        trigger={
          <Citation
            {...dialogOrDownloadProps}
            isLoading={isLoading}
            action={
              attachmentCitation.onRemove && (
                <CitationClose
                  onClick={(e) => {
                    e.stopPropagation();
                    attachmentCitation.onRemove &&
                      attachmentCitation.onRemove();
                  }}
                />
              )
            }
          >
            {previewImageUrl && <CitationImage imgSrc={previewImageUrl} />}
            <CitationIcons>{attachmentCitation.visual}</CitationIcons>
            <CitationTitle className="truncate text-ellipsis">
              {attachmentCitation.title}
            </CitationTitle>
            {attachmentCitation.type === "file" &&
              attachmentCitation.description && (
                <CitationDescription className="truncate text-ellipsis">
                  {attachmentCitation.description}
                </CitationDescription>
              )}
            {attachmentCitation.type === "node" && (
              <CitationDescription className="truncate text-ellipsis">
                <span>
                  {attachmentCitation.path ?? attachmentCitation.spaceName}
                </span>
              </CitationDescription>
            )}
          </Citation>
        }
        label={tooltipContent}
      />
      {attachmentCitation.type === "file" && (
        <FileViewer
          setViewerOpen={setViewerOpen}
          viewerOpen={viewerOpen}
          attachmentCitation={attachmentCitation}
          fileUploaderService={fileUploaderService}
          owner={owner}
        />
      )}
    </>
  );
}

export function contentFragmentToAttachmentCitation(
  contentFragment: ContentFragmentType
): AttachmentCitation {
  // Handle expired content fragments
  if (contentFragment.expiredReason) {
    return {
      type: "file",
      id: contentFragment.sId,
      title: `${contentFragment.title} (no longer available)`,
      visual: <IconFromContentType contentType={contentFragment.contentType} />,
      fileId:
        contentFragment.contentFragmentType === "file"
          ? contentFragment.fileId
          : null,
      contentType: contentFragment.contentType,
      attachmentCitationType: "fragment",
    };
  }

  if (isContentNodeContentFragment(contentFragment)) {
    const { provider, nodeType } = contentFragment.contentNodeData;
    const logo = getConnectorProviderLogoWithFallback({ provider });

    const visual =
      !provider || provider === "webcrawler" ? (
        <Icon visual={logo} size="md" />
      ) : (
        <DoubleIcon
          mainIcon={
            nodeType === "table"
              ? TableIcon
              : nodeType === "folder"
                ? FolderIcon
                : DocumentIcon
          }
          secondaryIcon={logo}
          size="md"
        />
      );

    return {
      type: "node",
      id: contentFragment.sId,
      title: contentFragment.title,
      sourceUrl: contentFragment.sourceUrl,
      visual,
      spaceName: contentFragment.contentNodeData.spaceName,
      attachmentCitationType: "fragment",
    };
  }

  if (isFileContentFragment(contentFragment)) {
    // Compute custom title/description for pasted files
    const isPasted = isPastedFile(contentFragment.contentType);
    const title = isPasted
      ? getDisplayNameFromPastedFileId(contentFragment.title)
      : contentFragment.title;
    const description = isPasted
      ? getDisplayDateFromPastedFileId(contentFragment.title)
      : undefined;
    return {
      type: "file",
      id: contentFragment.sId,
      title,
      sourceUrl: contentFragment.sourceUrl,
      visual: <IconFromContentType contentType={contentFragment.contentType} />,
      description,
      fileId: contentFragment.fileId,
      contentType: contentFragment.contentType,
      attachmentCitationType: "fragment",
    };
  }

  assertNever(contentFragment);
}

export function attachmentToAttachmentCitation(
  attachment: Attachment
): AttachmentCitation {
  if (attachment.type === "file") {
    return {
      type: "file",
      id: attachment.id,
      title: attachment.title,
      sourceUrl: attachment.sourceUrl,
      isUploading: attachment.isUploading,
      visual: <IconFromContentType contentType={attachment.contentType} />,
      description: attachment.description,
      fileId: attachment.id,
      contentType: attachment.contentType,
      onRemove: attachment.onRemove,
      attachmentCitationType: "inputBar",
    };
  } else {
    return {
      type: "node",
      id: attachment.id,
      title: attachment.title,
      spaceName: attachment.spaceName,
      spaceIcon: attachment.spaceIcon,
      path: attachment.path,
      visual: attachment.visual,
      sourceUrl: attachment.url,
      onRemove: attachment.onRemove,
      attachmentCitationType: "inputBar",
    };
  }
}

const IconFromContentType = ({
  contentType,
}: {
  contentType: string | undefined;
}) => {
  const visual = getContentTypeIcon(contentType);
  return <Icon visual={visual} size="md" />;
};

const FileViewer = ({
  viewerOpen,
  setViewerOpen,
  attachmentCitation,
  fileUploaderService,
  owner,
}: {
  viewerOpen: boolean;
  setViewerOpen: (open: boolean) => void;
  attachmentCitation: FileAttachmentCitation;
  fileUploaderService: FileUploaderService;
  owner: LightWorkspaceType;
}) => {
  const [text, setText] = useState<string | undefined>();

  const isAudio = isAudioContentType(attachmentCitation);

  // Yes this is weird, but for fragments we have the fileId directly
  // For input bar attachments, we need to get the file blob first
  // because the attachment fileId is actually the blob id
  // TODO: to fix
  const fileId =
    attachmentCitation.attachmentCitationType === "fragment"
      ? attachmentCitation.fileId
      : fileUploaderService.getFileBlob(attachmentCitation.fileId)?.fileId;

  const { fileContent, isFileContentLoading } = useFileContent({
    fileId,
    owner,
    config: {
      // Only fetch if we are on text, as for audio we use the processed content, which is the transcript
      disabled: isAudio || !viewerOpen,
    },
  });

  const {
    content: _processedContent,
    isContentLoading: isProcessedContentLoading,
  } = useFileProcessedContent({
    fileId,
    owner,
    config: {
      disabled: !isAudio || !viewerOpen,
    },
  });

  const isLoading = isAudio ? isProcessedContentLoading : isFileContentLoading;

  const processedContent = useMemo(
    () => {
      if (isProcessedContentLoading) {
        return;
      }
      return _processedContent()?.text();
    },
    // we can ignore this warning because we only want to recompute when loading state changes, as the function is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isProcessedContentLoading]
  );

  useEffect(() => {
    const handleText = async () => {
      if (isAudio) {
        if (isProcessedContentLoading) {
          return;
        }
        setText(await processedContent);
        return;
      }

      if (attachmentCitation.attachmentCitationType === "fragment") {
        if (isFileContentLoading) {
          return;
        }
        setText(fileContent);
        return;
      }

      setText(
        await fileUploaderService
          .getFileBlob(attachmentCitation.fileId)
          ?.file.text()
      );
    };

    // ok to not await, we handle loading state with isLoading, and if it fails the text will just not show
    void handleText();
  }, [
    attachmentCitation,
    fileContent,
    fileUploaderService,
    isAudio,
    isFileContentLoading,
    isProcessedContentLoading,
    processedContent,
  ]);

  return (
    <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
      <DialogContent size="xl" height="lg">
        <DialogHeader>
          <DialogTitle>{attachmentCitation.title}</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          {isLoading ? (
            <div className="flex h-48 w-full items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <pre className="m-0 max-h-[60vh] whitespace-pre-wrap break-words">
              {text}
            </pre>
          )}
        </DialogContainer>
        <DialogFooter
          rightButtonProps={{
            label: "Close",
            variant: "highlight",
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
