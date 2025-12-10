import {
  ArrowDownOnSquareIcon,
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Markdown,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useEffect, useMemo, useState } from "react";

import type {
  FileAttachmentCitation,
  MCPAttachmentCitation,
} from "@app/components/assistant/conversation/attachment/types";
import { isAudioContentType } from "@app/components/assistant/conversation/attachment/utils";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import {
  getFileDownloadUrl,
  getFileViewUrl,
  useFileContent,
  useFileProcessedContent,
} from "@app/lib/swr/files";
import type { LightWorkspaceType } from "@app/types";

export const AttachmentViewer = ({
  viewerOpen,
  setViewerOpen,
  attachmentCitation,
  conversationId,
  owner,
}: {
  viewerOpen: boolean;
  setViewerOpen: (open: boolean) => void;
  attachmentCitation: FileAttachmentCitation | MCPAttachmentCitation;
  conversationId: string | null;
  owner: LightWorkspaceType;
}) => {
  const fileUploaderService = useFileUploaderService({
    owner: owner,
    useCase: "conversation",
    useCaseMetadata: {
      conversationId: conversationId ?? undefined,
    },
  });

  const [text, setText] = useState<string | undefined>();

  const isAudio = isAudioContentType(attachmentCitation);
  const isMarkdown = attachmentCitation.contentType === "text/markdown";

  // For input bar attachments, try to get the local file blob for reading content directly.
  // For fragments/mcp, we always fetch from server.
  const fileBlob =
    attachmentCitation.attachmentCitationType === "inputBar"
      ? fileUploaderService.getFileBlob(attachmentCitation.id)
      : undefined;

  // Fetch from server if:
  // - It's a fragment or mcp attachment (always server-side)
  // - It's an input bar attachment but we don't have local content (e.g., tool uploads)
  const hasLocalContent = fileBlob && fileBlob.file.size > 0;
  const shouldFetchFromServer =
    attachmentCitation.attachmentCitationType === "fragment" ||
    attachmentCitation.attachmentCitationType === "mcp" ||
    !hasLocalContent;

  // Use the fileId from the citation (which is the real server file sId).
  const fileId = attachmentCitation.fileId;

  const { fileContent, isFileContentLoading } = useFileContent({
    fileId,
    owner,
    config: {
      // Only fetch if we are on text, as for audio we use the processed content, which is the transcript

      disabled: isAudio || !viewerOpen || !shouldFetchFromServer,
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

      if (shouldFetchFromServer) {
        if (isFileContentLoading) {
          return;
        }
        setText(fileContent);
        return;
      }

      setText(
        await fileUploaderService
          .getFileBlob(attachmentCitation.id)
          ?.file.text()
      );
    };

    // ok to not await, we handle loading state with isLoading, and if it fails, the text will just not show
    void handleText();
  }, [
    attachmentCitation,
    fileContent,
    fileUploaderService,
    isAudio,
    isFileContentLoading,
    isProcessedContentLoading,
    processedContent,
    shouldFetchFromServer,
  ]);

  const audioPlayer = isAudio && (
    <>
      <audio
        controls
        className="mt-4 w-full"
        src={getFileViewUrl(owner, fileId)}
      />
      <div className="mb-4" />
    </>
  );

  const canDownload = !!fileId;
  const onClickDownload = () => {
    const downloadUrl = canDownload
      ? getFileDownloadUrl(owner, fileId)
      : undefined;

    if (downloadUrl) {
      window.open(downloadUrl, "_blank");
    }
  };

  return (
    <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
      <DialogContent size="xl" height="lg">
        <DialogHeader>
          <DialogTitle>
            {canDownload && (
              <Button
                onClick={onClickDownload}
                icon={ArrowDownOnSquareIcon}
                size="mini"
                tooltip="Download file"
                variant="ghost"
                className={"mr-2 align-middle"}
              />
            )}
            <span className="mr-2 inline-flex align-middle">
              {attachmentCitation.visual}
            </span>
            {attachmentCitation.title}
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          {isLoading && (
            <div className="flex h-48 w-full items-center justify-center">
              <Spinner />
            </div>
          )}
          {!isLoading && audioPlayer}
          {!isLoading && isMarkdown && text && (
            <Markdown content={text} isStreaming={false} isLastMessage />
          )}
          {!isLoading && !isMarkdown && !isAudio && (
            <pre className="m-0 whitespace-pre-wrap break-words">{text}</pre>
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
