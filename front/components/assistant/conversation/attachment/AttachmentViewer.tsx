import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { DownloadIcon } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

import type { FileAttachmentCitation } from "@app/components/assistant/conversation/attachment/types";
import { isAudioContentType } from "@app/components/assistant/conversation/attachment/utils";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
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

  const onClickDownload = () => {
    const downloadUrl =
      isAudio && fileId ? getFileDownloadUrl(owner, fileId) : undefined;

    if (downloadUrl) {
      window.open(downloadUrl, "_blank");
    }
  };

  return (
    <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
      <DialogContent size="xl" height="lg">
        <DialogHeader>
          <DialogTitle>
            {isAudio && (
              <Button
                onClick={onClickDownload}
                icon={DownloadIcon}
                size="mini"
                tooltip="Download audio file"
                variant="ghost"
                className={"mr-2 align-middle"}
              />
            )}
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
          {!isLoading && (
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
