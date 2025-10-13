import {
  Citation,
  CitationClose,
  CitationDescription,
  CitationIcons,
  CitationImage,
  CitationTitle,
  Icon,
  Tooltip,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

import { AttachmentViewer } from "@app/components/assistant/conversation/attachment/AttachmentViewer";
import type { AttachmentCitation } from "@app/components/assistant/conversation/attachment/types";
import {
  isAudioContentType,
  isTextualContentType,
} from "@app/components/assistant/conversation/attachment/utils";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import type { LightWorkspaceType } from "@app/types";
import { isSupportedImageContentType } from "@app/types";

interface AttachmentCitationProps {
  owner: LightWorkspaceType;
  attachmentCitation: AttachmentCitation;
  fileUploaderService: FileUploaderService;
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
        <AttachmentViewer
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
