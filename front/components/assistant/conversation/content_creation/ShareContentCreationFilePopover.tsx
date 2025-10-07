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

const USER_LABEL = "Internal - Workspace members with the link";

const scopeOptions: {
  icon: React.ComponentType;
  label: string;
  value: FileShareScope;
}[] = [
  {
    icon: UserGroupIcon,
    label: USER_LABEL,
    value: "workspace",
  },
  {
    icon: GlobeAltIcon,
    label: "Public - Anyone with the link",
    value: "public",
  },
];
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
  disabled = false,
}: FileSharingDropdownProps) {
  const selectedOption = scopeOptions.find(
    (opt) => opt.value === selectedScope
  );

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-semibold text-primary dark:text-primary-night">
        Link access
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
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-semibold text-primary dark:text-primary-night">
              Share this content
            </h2>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Choose who can open this link
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
                      ? "Public sharing is disabled by your admin"
                      : "This Frame includes company data"
                  }
                  variant={isPublicSharingForbidden ? "primary" : "golden"}
                  icon={InformationCircleIcon}
                >
                  {isPublicSharingForbidden
                    ? "You can still share with workspace members."
                    : "Review before making it public."}
                </ContentMessage>
              )}
            {!isFileShareLoading && (
              <div className="flex flex-col gap-3">
                {isPublicSharingForbidden ? (
                  <div className="flex items-center gap-2">
                    <UserGroupIcon />
                    <p className="copy-sm">{USER_LABEL}</p>
                  </div>
                ) : (
                  <FileSharingDropdown
                    selectedScope={selectedScope}
                    onScopeChange={handleScopeChange}
                    owner={owner}
                    disabled={isUpdatingShare}
                    isLoading={isUpdatingShare}
                  />
                )}

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
