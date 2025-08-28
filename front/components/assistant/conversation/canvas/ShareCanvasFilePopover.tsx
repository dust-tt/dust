import {
  Button,
  ClipboardCheckIcon,
  ClipboardIcon,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  GlobeAltIcon,
  IconButton,
  InformationCircleIcon,
  Input,
  Label,
  LinkIcon,
  LockIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Separator,
  Spinner,
  useCopyToClipboard,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import React from "react";

import { useShareCanvasFile } from "@app/lib/swr/files";
import type { FileShareScope, LightWorkspaceType } from "@app/types";

interface FileSharingDropdownProps {
  selectedScope: FileShareScope;
  onScopeChange: (scope: FileShareScope) => void;
  owner: LightWorkspaceType;
  disabled?: boolean;
  isLoading?: boolean;
}

function FileSharingDropdown({
  selectedScope,
  onScopeChange,
  owner,
  disabled = false,
}: FileSharingDropdownProps) {
  const scopeOptions: {
    icon: React.ComponentType;
    label: string;
    value: FileShareScope;
  }[] = [
    {
      icon: LockIcon,
      label: "Only conversation participants",
      value: "conversation_participants",
    },
    {
      icon: UserGroupIcon,
      label: `Anyone in ${owner.name} workspace`,
      value: "workspace",
    },
    {
      icon: GlobeAltIcon,
      label: "Anyone with the link",
      value: "public",
    },
  ];

  const selectedOption = scopeOptions.find(
    (opt) => opt.value === selectedScope
  );

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-semibold text-primary dark:text-primary-night">
        Who can access
      </Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            isSelect
            label={selectedOption?.label}
            icon={selectedOption?.icon}
            disabled={disabled}
            className="grid w-full grid-cols-[auto_1fr_auto] truncate"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
          {scopeOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              label={option.label}
              onClick={() => onScopeChange(option.value)}
              truncateText
              icon={option.icon}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface ShareCanvasFilePopoverProps {
  fileId: string;
  owner: LightWorkspaceType;
  isUsingConversationFiles: boolean;
}

export function ShareCanvasFilePopover({
  fileId,
  owner,
  isUsingConversationFiles,
}: ShareCanvasFilePopoverProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isCopied, copyToClipboard] = useCopyToClipboard();
  const [isUpdatingShare, setIsUpdatingShare] = React.useState(false);
  const [selectedScope, setSelectedScope] = React.useState<FileShareScope>(
    "conversation_participants"
  );

  const isSharingForbidden =
    owner.metadata?.allowInteractiveContentSharing === false;

  const { doShare, fileShare, isFileShareLoading, isFileShareError } =
    useShareCanvasFile({
      fileId,
      owner,
    });

  // Sync selectedScope with current fileShare data.
  React.useEffect(() => {
    if (!isFileShareLoading && !isFileShareError && fileShare) {
      setSelectedScope(fileShare.scope);
    }
  }, [fileShare, isFileShareLoading, isFileShareError]);

  const handleChangeFileShare = async (shareScope: FileShareScope) => {
    setIsUpdatingShare(true);
    try {
      await doShare(shareScope);
      setSelectedScope(shareScope);
    } finally {
      setIsUpdatingShare(false);
    }
  };

  const handleScopeChange = async (scope: FileShareScope) => {
    if (scope !== selectedScope) {
      setSelectedScope(scope);

      await handleChangeFileShare(scope);
    }
  };

  const handleCopyLink = async () => {
    await copyToClipboard(fileShare?.shareUrl ?? "");
  };

  return (
    <PopoverRoot open={isOpen} onOpenChange={setIsOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          icon={LinkIcon}
          size="xs"
          variant="ghost"
          tooltip="Share public link"
        />
      </PopoverTrigger>
      <PopoverContent className="flex w-96 flex-col" align="end">
        <div className="flex flex-col gap-4">
          <div className="text-base font-semibold text-primary dark:text-primary-night">
            Share this Canvas
          </div>

          <div className="flex flex-col">
            {isFileShareLoading && (
              <div className="flex h-full items-center justify-center">
                <Spinner size="sm" />
              </div>
            )}
            {/* Warning if sharing is disabled. */}
            {!isFileShareLoading &&
              (isSharingForbidden || isUsingConversationFiles) && (
                <ContentMessage
                  title={
                    isSharingForbidden
                      ? "Sharing disabled by admin"
                      : "This canvas contains company data"
                  }
                  variant="golden"
                  icon={InformationCircleIcon}
                >
                  {isSharingForbidden
                    ? "Your workspace administrator has turned off sharing of Canvases."
                    : "Sharing is disabled to protect company information. You can view this privately."}
                </ContentMessage>
              )}
            {/* File sharing link. */}
            {!isFileShareLoading && (
              <div className="mt-4 flex flex-col gap-3">
                <FileSharingDropdown
                  selectedScope={selectedScope}
                  onScopeChange={handleScopeChange}
                  owner={owner}
                  disabled={
                    isSharingForbidden ||
                    isUsingConversationFiles ||
                    isUpdatingShare
                  }
                  isLoading={isUpdatingShare}
                />

                <Separator />

                {/* Content area with loading state */}
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
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
