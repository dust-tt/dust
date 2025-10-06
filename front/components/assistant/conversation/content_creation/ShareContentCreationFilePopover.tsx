import {
  Button,
  ClipboardCheckIcon,
  ClipboardIcon,
  cn,
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

import { useShareContentCreationFile } from "@app/lib/swr/files";
import type { FileShareScope, LightWorkspaceType } from "@app/types";

interface FileSharingDropdownProps {
  selectedScope: FileShareScope;
  onScopeChange: (scope: FileShareScope) => void;
  owner: LightWorkspaceType;
  disabled?: boolean;
  isLoading?: boolean;
  isUsingConversationFiles: boolean;
  isPublicSharingForbidden: boolean;
}

function FileSharingDropdown({
  selectedScope,
  onScopeChange,
  owner,
  disabled = false,
  isUsingConversationFiles,
  isPublicSharingForbidden,
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
            className={cn(
              "grid w-full grid-cols-[auto_1fr_auto] truncate",
              selectedOption?.value === "public" &&
                isUsingConversationFiles &&
                "text-primary-400 dark:text-primary-400-night"
            )}
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
              disabled={
                option.value === "public" &&
                (isPublicSharingForbidden || isUsingConversationFiles)
              }
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface ShareContentCreationFilePopoverProps {
  fileId: string;
  owner: LightWorkspaceType;
  isUsingConversationFiles: boolean;
}

export function ShareContentCreationFilePopover({
  fileId,
  owner,
  isUsingConversationFiles,
}: ShareContentCreationFilePopoverProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isCopied, copyToClipboard] = useCopyToClipboard();
  const [isUpdatingShare, setIsUpdatingShare] = React.useState(false);
  const [selectedScope, setSelectedScope] = React.useState<FileShareScope>(
    "conversation_participants"
  );

  const isPublicSharingForbidden =
    owner.metadata?.allowContentCreationFileSharing === false;

  const { doShare, fileShare, isFileShareLoading, isFileShareError } =
    useShareContentCreationFile({
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

  const shareURL = fileShare?.shareUrl ?? "";
  const handleCopyLink = async () => {
    await copyToClipboard(shareURL);
  };

  return (
    <PopoverRoot open={isOpen} onOpenChange={setIsOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button size="xs" variant="ghost" label="Share" />
      </PopoverTrigger>
      <PopoverContent className="flex w-96 flex-col" align="end">
        <div className="flex flex-col gap-4">
          <div className="text-base font-semibold text-primary dark:text-primary-night">
            Share this Content Creation
          </div>

          <div className="flex flex-col">
            {isFileShareLoading && (
              <div className="flex h-full items-center justify-center">
                <Spinner size="sm" />
              </div>
            )}
            {/* Warning if sharing is disabled. */}
            {!isFileShareLoading &&
              (isPublicSharingForbidden || isUsingConversationFiles) && (
                <ContentMessage
                  className="mb-4"
                  title={
                    isPublicSharingForbidden
                      ? "Sharing disabled by admin"
                      : "This file contains company data"
                  }
                  variant="golden"
                  icon={InformationCircleIcon}
                >
                  {isPublicSharingForbidden
                    ? "Your workspace administrator has turned off public sharing of Content Creation files."
                    : "This Content Creation relies on conversation files. The sharing to public option is " +
                      "disabled to protect company information."}
                </ContentMessage>
              )}
            {/* File sharing link. */}
            {!isFileShareLoading && (
              <div className="flex flex-col gap-3">
                <FileSharingDropdown
                  selectedScope={selectedScope}
                  onScopeChange={handleScopeChange}
                  owner={owner}
                  disabled={isUpdatingShare}
                  isUsingConversationFiles={isUsingConversationFiles}
                  isPublicSharingForbidden={isPublicSharingForbidden}
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
                      value={shareURL}
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
