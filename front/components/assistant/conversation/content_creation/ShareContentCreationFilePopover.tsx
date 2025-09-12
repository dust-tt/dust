import {
  Button,
  Card,
  ClipboardCheckIcon,
  ClipboardIcon,
  cn,
  ContentMessage,
  GlobeAltIcon,
  IconButton,
  InformationCircleIcon,
  Input,
  Label,
  LinkIcon,
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

interface ShareOptionProps {
  scope: FileShareScope;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isSelected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

function ShareOption({
  scope,
  label,
  icon: Icon,
  isSelected,
  onSelect,
  disabled = false,
}: ShareOptionProps) {
  return (
    <Card
      className={cn(
        "cursor-pointer transition-colors",
        isSelected
          ? "border-highlight-500 bg-highlight-100 shadow-md hover:border-highlight-400 hover:bg-highlight-200 dark:border-highlight-400 dark:bg-highlight-800/30 dark:hover:border-highlight-300 dark:hover:bg-highlight-700/30"
          : "hover:border-structure-300 dark:hover:border-structure-300-dark",
        disabled ? "cursor-not-allowed opacity-50" : ""
      )}
      onClick={disabled ? undefined : onSelect}
    >
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5" />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-primary dark:text-primary-night">
            {label}
          </span>
          <span className="text-element-600 dark:text-element-600-dark text-xs">
            {scope === "workspace"
              ? "People in your workspace"
              : scope === "public"
                ? "Anyone with the link"
                : "Only you can access"}
          </span>
        </div>
      </div>
    </Card>
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
  const [showShareOptions, setShowShareOptions] = React.useState(false);
  const [selectedScope, setSelectedScope] =
    React.useState<FileShareScope>("none");

  const isSharingForbidden =
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
      setShowShareOptions(fileShare.scope !== "none");
    }
  }, [fileShare, isFileShareLoading, isFileShareError]);

  const handleChangeFileShare = async (shareScope: FileShareScope) => {
    setIsUpdatingShare(true);
    try {
      await doShare(shareScope);
      setSelectedScope(shareScope);
      setShowShareOptions(shareScope !== "none");
    } finally {
      setIsUpdatingShare(false);
    }
  };

  const handleCreateLink = () => {
    setShowShareOptions(true);
  };

  const handleShareOptionSelect = async (scope: FileShareScope) => {
    if (scope === "none") {
      setShowShareOptions(false);
      setSelectedScope("none");
      await handleChangeFileShare("none");
    } else {
      await handleChangeFileShare(scope);
    }
  };

  const shareURL = fileShare?.shareUrl ?? "";
  const handleCopyLink = async () => {
    await copyToClipboard(shareURL);
  };

  const currentShareScope = fileShare?.scope;

  const getShareButtonIcon = () => {
    switch (currentShareScope) {
      case "workspace":
        return UserGroupIcon;
      case "public":
        return GlobeAltIcon;
      default:
        return LinkIcon;
    }
  };

  const getShareButtonTooltip = () => {
    switch (currentShareScope) {
      case "workspace":
        return `Shared with: ${owner.name} workspace`;
      case "public":
        return "Shared with: Anyone with the link";
      default:
        return "Share this Content Creation";
    }
  };

  const getPlaceholderUrl = () => {
    return `${window.location.origin}/w/${owner.sId}/assistant/conversation/share`;
  };

  const isDisabled =
    isSharingForbidden || isUsingConversationFiles || isUpdatingShare;

  const handleOpenChange = (open: boolean) => {
    // Reset to initial state if dialog is closed and file is not shared
    if (!open && (!fileShare || fileShare.scope === "none")) {
      setShowShareOptions(false);
    }
    setIsOpen(open);
  };

  return (
    <PopoverRoot open={isOpen} onOpenChange={handleOpenChange} modal={true}>
      <PopoverTrigger asChild>
        <Button
          icon={getShareButtonIcon()}
          size="xs"
          variant="ghost"
          tooltip={getShareButtonTooltip()}
        />
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
              (isSharingForbidden || isUsingConversationFiles) && (
                <ContentMessage
                  className="mb-4"
                  title={
                    isSharingForbidden
                      ? "Sharing disabled by admin"
                      : "This file contains company data"
                  }
                  variant="golden"
                  icon={InformationCircleIcon}
                >
                  {isSharingForbidden
                    ? "Your workspace administrator has turned off sharing of Content Creation files."
                    : "This Content Creation relies on conversation files. The sharing to public option is " +
                      "disabled to protect company information."}
                </ContentMessage>
              )}
            {/* File sharing interface. */}
            {!isFileShareLoading && (
              <div className="flex flex-col gap-3">
                {!showShareOptions ? (
                  // Initial state: disabled input with placeholder and create link button
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <div className="grow">
                        <Input
                          disabled
                          placeholder={getPlaceholderUrl()}
                          className="text-element-600 dark:text-element-600-dark"
                        />
                      </div>
                    </div>
                    <Button
                      label="Create link"
                      icon={LinkIcon}
                      onClick={handleCreateLink}
                      disabled={isDisabled}
                      size="sm"
                      className="w-full"
                    />
                  </div>
                ) : (
                  // Share options state
                  <div className="flex flex-col gap-3">
                    <Label className="text-sm font-semibold text-primary dark:text-primary-night">
                      Who can access
                    </Label>
                    <div className="flex flex-col gap-2">
                      <ShareOption
                        scope="workspace"
                        label={`${owner.name} workspace`}
                        icon={UserGroupIcon}
                        isSelected={selectedScope === "workspace"}
                        onSelect={() => handleShareOptionSelect("workspace")}
                        disabled={isDisabled}
                      />
                      <ShareOption
                        scope="public"
                        label="Anyone with the link"
                        icon={GlobeAltIcon}
                        isSelected={selectedScope === "public"}
                        onSelect={() => handleShareOptionSelect("public")}
                        disabled={isDisabled}
                      />
                      <ShareOption
                        scope="none"
                        label="Private"
                        icon={LinkIcon}
                        isSelected={selectedScope === "none"}
                        onSelect={() => handleShareOptionSelect("none")}
                        disabled={isDisabled}
                      />
                    </div>

                    {selectedScope !== "none" && (
                      <>
                        <Separator />
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
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
