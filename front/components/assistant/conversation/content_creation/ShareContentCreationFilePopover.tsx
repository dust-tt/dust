import {
  Button,
  Card,
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
        "cursor-pointer",
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
          <Label className="text-sm font-medium text-primary dark:text-primary-night">
            {label}
          </Label>
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

const getSharingOptions = (name: string) => [
  {
    label: `Anyone in ${name} workspace`,
    icon: UserGroupIcon,
    value: "workspace" as const,
  },
  {
    label: "Anyone with the link",
    icon: GlobeAltIcon,
    value: "public" as const,
  },
  {
    label: "Private",
    icon: LockIcon,
    value: "none" as const,
  },
];

export function ShareContentCreationFilePopover({
  fileId,
  owner,
  isUsingConversationFiles,
}: ShareContentCreationFilePopoverProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isCopied, copyToClipboard] = useCopyToClipboard();

  const isSharingForbidden =
    owner.metadata?.allowContentCreationFileSharing === false;

  const { doShare, fileShare, isFileShareLoading, isFileShareError } =
    useShareContentCreationFile({
      fileId,
      owner,
    });

  const currentScope = fileShare?.scope;

  const onPublish = async () => {
    await handleChangeFileShare("workspace");
  };

  const handleChangeFileShare = async (shareScope: FileShareScope) => {
    await doShare(shareScope);
  };

  const shareURL = fileShare?.shareUrl ?? "";
  const handleCopyLink = async () => {
    await copyToClipboard(shareURL);
  };

  const options = getSharingOptions(owner.name);
  const selectedOption = options.find(
    (option) => option.value === fileShare?.scope
  );
  const isPublished =
    selectedOption !== undefined &&
    ["workspace", "public"].includes(selectedOption?.value);

  const getPlaceholderUrl = () => {
    return `${window.location.origin}/w/${owner.sId}/assistant/conversation/share`;
  };

  const isDisabled = isSharingForbidden || isUsingConversationFiles;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
  };

  return (
    <PopoverRoot open={isOpen} onOpenChange={handleOpenChange} modal={true}>
      <PopoverTrigger asChild>
        <Button
          icon={isPublished ? selectedOption?.icon : undefined}
          label={isPublished ? "Published" : "Publish"}
          size="xs"
        />
      </PopoverTrigger>
      <PopoverContent className="flex w-96 flex-col" align="end">
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-primary dark:text-primary-night">
              Publish and share this content
            </h2>
            <p className="text-sm text-primary-light dark:text-primary-light-night">
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
            {!isFileShareLoading && (
              <div className="flex flex-col gap-3">
                {currentScope === "none" ? (
                  <div className="flex items-center gap-2">
                    <div className="grow">
                      <Input
                        disabled
                        placeholder={getPlaceholderUrl()}
                        className="text-element-600 dark:text-element-600-dark"
                      />
                    </div>
                    <Button
                      label="Create link"
                      icon={LinkIcon}
                      onClick={onPublish}
                      disabled={isDisabled}
                      size="sm"
                    />
                  </div>
                ) : (
                  // Share options
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-semibold text-primary dark:text-primary-night">
                      Who can access
                    </h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          isSelect
                          label={selectedOption?.label}
                          icon={selectedOption?.icon}
                          className={cn(
                            "grid w-full grid-cols-[auto_1fr_auto] truncate",
                            selectedOption?.value === "public" &&
                              isUsingConversationFiles &&
                              "text-primary-400 dark:text-primary-400-night"
                          )}
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                        {options.map((option) => (
                          <DropdownMenuItem
                            key={option.value}
                            label={option.label}
                            onClick={() => handleChangeFileShare(option.value)}
                            truncateText
                            icon={option.icon}
                            disabled={
                              option.value === "public" &&
                              isUsingConversationFiles
                            }
                          />
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
                {currentScope !== "none" && (
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
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
