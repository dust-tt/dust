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
  InformationCircleIcon,
  Label,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
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
      icon: UserGroupIcon,
      label: `${owner.name} workspace members with the link`,
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
  const [selectedScope, setSelectedScope] =
    React.useState<FileShareScope>("workspace");

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
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-semibold text-primary dark:text-primary-night">
              Share this content
            </h2>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Share with your workspace or make it public
            </p>
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
                    ? "Your workspace administrator has turned off public sharing of Frame files."
                    : "This Frame file relies on conversation files. The sharing to public option is " +
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

                <Button
                  className="ml-auto grid grid-cols-[1rem_4rem]"
                  icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
                  onClick={handleCopyLink}
                  label={isCopied ? "Copied!" : "Copy link"}
                />
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
