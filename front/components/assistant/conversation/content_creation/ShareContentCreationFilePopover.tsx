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

interface SharingOption {
  label: string;
  icon: (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element;
  value: FileShareScope;
}

const PRIVATE_OPTION = {
  label: "Private",
  icon: LockIcon,
  value: "none" as const,
};

const getSharingOptions = (name: string): SharingOption[] => [
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
  PRIVATE_OPTION,
];

interface FileSharingDropdownProps {
  selectedOption: SharingOption;
  options: SharingOption[];
  onScopeChange: (option: SharingOption) => void;
  owner: LightWorkspaceType;
  disabled?: boolean;
  isLoading?: boolean;
  isUsingConversationFiles: boolean;
  isPublicSharingForbidden: boolean;
}

function FileSharingDropdown({
  selectedOption,
  onScopeChange,
  owner,
  disabled = false,
  options,
  isUsingConversationFiles,
  isPublicSharingForbidden,
}: FileSharingDropdownProps) {
  const onPublish = () => {
    const workspaceOption = options.find((opt) => opt.value === "workspace");

    if (workspaceOption) {
      onScopeChange(workspaceOption);
    }
  };

  const placeholderUrl = `${window.location.origin}/w/${owner.sId}/assistant/conversation/share`;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3">
        {selectedOption.value === "none" ? (
          <div className="flex items-center gap-2">
            <div className="grow">
              <Input
                disabled
                placeholder={placeholderUrl}
                className="text-element-600 dark:text-element-600-dark"
              />
            </div>
            <Button
              label="Create link"
              icon={LinkIcon}
              onClick={onPublish}
              size="sm"
            />
          </div>
        ) : (
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
                  label={selectedOption.label}
                  icon={selectedOption.icon}
                  className={cn(
                    "grid w-full grid-cols-[auto_1fr_auto] truncate",
                    selectedOption.value === "public" &&
                      isUsingConversationFiles &&
                      "text-primary-400 dark:text-primary-400-night"
                  )}
                  disabled={disabled}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                {options.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    label={option.label}
                    onClick={() => onScopeChange(option)}
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
        )}
      </div>
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
  const [selectedOption, setSelectedOption] =
    React.useState<SharingOption>(PRIVATE_OPTION);

  const isPublicSharingForbidden =
    owner.metadata?.allowContentCreationFileSharing === false;

  const isPublished = selectedOption.value !== "none";

  const options = getSharingOptions(owner.name);

  const { doShare, fileShare, isFileShareLoading, isFileShareError } =
    useShareContentCreationFile({
      fileId,
      owner,
    });

  const shareURL = fileShare?.shareUrl ?? "";

  // Sync selectedScope with current fileShare data.
  React.useEffect(() => {
    if (!isFileShareLoading && !isFileShareError && fileShare) {
      const selectedOption = options.find(
        (option) => option.value === fileShare.scope
      );

      if (selectedOption) {
        setSelectedOption(selectedOption);
      }
    }
  }, [fileShare, isFileShareLoading, isFileShareError, options]);

  const handleChangeFileShare = async (shareScope: FileShareScope) => {
    setIsUpdatingShare(true);
    try {
      await doShare(shareScope);
    } finally {
      setIsUpdatingShare(false);
    }
  };

  const handleScopeChange = async (option: SharingOption) => {
    if (option.value !== selectedOption.value) {
      await handleChangeFileShare(option.value);
    }
  };

  const handleCopyLink = async () => {
    await copyToClipboard(shareURL);
  };

  return (
    <PopoverRoot open={isOpen} onOpenChange={setIsOpen} modal={true}>
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
            {!isFileShareLoading && (
              <>
                {(isPublicSharingForbidden || isUsingConversationFiles) && (
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

                <div className="flex flex-col gap-3">
                  <FileSharingDropdown
                    selectedOption={selectedOption}
                    options={options}
                    onScopeChange={handleScopeChange}
                    owner={owner}
                    disabled={isUpdatingShare}
                    isUsingConversationFiles={isUsingConversationFiles}
                    isPublicSharingForbidden={isPublicSharingForbidden}
                    isLoading={isUpdatingShare}
                  />
                  {selectedOption.value !== "none" && (
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
              </>
            )}
          </div>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
