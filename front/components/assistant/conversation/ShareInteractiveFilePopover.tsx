import {
  Button,
  ClipboardCheckIcon,
  ClipboardIcon,
  IconButton,
  Input,
  LinkIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Spinner,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import React from "react";

import { useShareInteractiveFile } from "@app/lib/swr/files";
import type { LightWorkspaceType } from "@app/types";

interface ShareInteractiveFilePopoverProps {
  fileId: string;
  owner: LightWorkspaceType;
  disabled?: boolean;
  tooltip?: string;
}

export function ShareInteractiveFilePopover({
  fileId,
  owner,
  disabled = false,
  tooltip = "Share public link",
}: ShareInteractiveFilePopoverProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isCopied, copyToClipboard] = useCopyToClipboard();
  const [isUpdatingShare, setIsUpdatingShare] = React.useState(false);

  const { doShare, fileShare, isFileShareLoading } = useShareInteractiveFile({
    fileId,
    owner,
  });

  const handleChangeFileShare = React.useCallback(
    async (isShared: boolean) => {
      setIsUpdatingShare(true);
      try {
        await doShare(isShared);
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

  return (
    <PopoverRoot open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          icon={LinkIcon}
          size="xs"
          variant="ghost"
          tooltip={tooltip}
          disabled={disabled}
        />
      </PopoverTrigger>
      <PopoverContent className="flex h-48 w-96 flex-col" align="end">
        <div className="flex flex-1 flex-col">
          <div className="mb-4">
            <div className="text-base font-semibold text-primary dark:text-primary-night">
              Share interactive content
            </div>
            <p className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
              {isShared
                ? "Anyone with this link can view your interactive content"
                : "Create a link to share your interactive content"}
            </p>
          </div>

          <div className="flex flex-1 flex-col justify-between">
            <div className="flex-1">
              {isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner size="sm" />
                </div>
              ) : isShared ? (
                <div className="flex items-center gap-2">
                  <div className="grow">
                    <Input
                      disabled
                      onClick={(e) => e.currentTarget.select()}
                      readOnly
                      value={fileShare?.shareUrl ?? ""}
                    />
                  </div>
                  <IconButton
                    className="flex-none"
                    icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
                    tooltip={isCopied ? "Copied!" : "Copy link"}
                    onClick={handleCopyLink}
                  />
                </div>
              ) : (
                <p className="text-sm text-gray-600">
                  This will create a public link that anyone can use to view
                  your interactive content.
                </p>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              {isShared ? (
                <Button
                  label="Stop sharing"
                  variant="warning"
                  size="sm"
                  onClick={() => handleChangeFileShare(false)}
                  disabled={isLoading}
                />
              ) : (
                <Button
                  label="Create share link"
                  variant="primary"
                  size="sm"
                  onClick={() => handleChangeFileShare(true)}
                  disabled={isLoading}
                />
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
