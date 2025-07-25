import {
  Button,
  ClipboardCheckIcon,
  ClipboardIcon,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  IconButton,
  Input,
  Spinner,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import React from "react";

import { isFileUsingConversationFiles } from "@app/lib/files";
import { useShareInteractiveFile } from "@app/lib/swr/files";
import type { LightWorkspaceType } from "@app/types";

interface ShareInteractiveFileDialogProps {
  fileContent: string;
  fileId: string;
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}

export function ShareInteractiveFileDialog({
  fileContent,
  fileId,
  isOpen,
  onClose,
  owner,
}: ShareInteractiveFileDialogProps) {
  const [isCopied, copyToClipboard] = useCopyToClipboard();
  const [isUpdatingShare, setIsUpdatingShare] = React.useState(false);

  const { doShare, fileShare, isFileShareLoading } = useShareInteractiveFile({
    fileId,
    owner,
  });

  const handleChangeFileShare = React.useCallback(
    async (isPublic: boolean) => {
      setIsUpdatingShare(true);
      try {
        await doShare(isPublic);
      } finally {
        setIsUpdatingShare(false);
      }
    },
    [doShare]
  );

  const handleCopyLink = React.useCallback(async () => {
    await copyToClipboard(fileShare?.shareUrl ?? "");
  }, [copyToClipboard, fileShare?.shareUrl]);

  const isShared = !!fileShare?.shareUrl;
  const isLoading = isFileShareLoading || isUpdatingShare;

  const isUsingConversationFiles = isFileUsingConversationFiles(fileContent);
  const description = isFileUsingConversationFiles(fileContent)
    ? "This interactive file uses conversation files. It cannot be shared publicly."
    : isShared
      ? "Anyone with this link can view your interactive file"
      : "Create a public link to share your interactive file";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share interactive file</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Spinner size="sm" />
          </div>
        ) : isShared ? (
          <DialogContainer>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="grow">
                  <Input
                    value={fileShare?.shareUrl ?? ""}
                    readOnly
                    onClick={(e) => e.currentTarget.select()}
                  />
                </div>
                <IconButton
                  className="flex-none"
                  icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
                  tooltip={isCopied ? "Copied!" : "Copy link"}
                  onClick={handleCopyLink}
                />
              </div>
            </div>
          </DialogContainer>
        ) : (
          <DialogContainer>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                This will create a public link that anyone can use to view your
                interactive file.
              </p>
            </div>
          </DialogContainer>
        )}

        <DialogFooter>
          {isShared ? (
            <Button
              label="Stop sharing"
              variant="warning"
              onClick={() => handleChangeFileShare(false)}
              disabled={isLoading}
            />
          ) : (
            <Button
              label="Create public link"
              variant="primary"
              onClick={() => handleChangeFileShare(true)}
              disabled={isLoading}
            />
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
