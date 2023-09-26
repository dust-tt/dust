import {
  ArrowUpOnSquareIcon,
  Button,
  ClipboardCheckIcon,
  DropdownMenu,
  LinkStrokeIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

export function ConversationTitle({
  title,
  shareLink,
  onDelete,
}: {
  title: string;
  shareLink: string;
  onDelete?: () => void;
}) {
  const [copyLinkSuccess, setCopyLinkSuccess] = useState<boolean>(false);

  const handleClick = async () => {
    await navigator.clipboard.writeText(shareLink || "");
    setCopyLinkSuccess(true);
    setTimeout(() => {
      setCopyLinkSuccess(false);
    }, 1000);
  };

  return (
    <div className="grid h-full max-w-full grid-cols-[1fr,auto] items-center gap-4">
      <div className="overflow-hidden truncate">
        <span className="font-bold">{title}</span>
      </div>

      <div className="flex space-x-1">
        <div className="hidden lg:flex">
          {onDelete && (
            <DropdownMenu>
              <DropdownMenu.Button>
                <Button
                  size="sm"
                  labelVisible={false}
                  tooltipPosition="below"
                  variant="secondaryWarning"
                  label="Delete Conversation"
                  icon={TrashIcon}
                />
              </DropdownMenu.Button>
              <DropdownMenu.Items width={280}>
                <div className="flex flex-col gap-y-4 px-4 py-4">
                  <div className="flex flex-col gap-y-2">
                    <div className="grow text-sm font-medium text-element-800">
                      Are you sure you want to delete?
                    </div>

                    <div className="text-sm font-normal text-element-700">
                      This will delete the conversation for everyone.
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <Button
                      variant="primaryWarning"
                      size="sm"
                      label={"Delete for Everyone"}
                      icon={TrashIcon}
                      onClick={onDelete}
                    />
                  </div>
                </div>
              </DropdownMenu.Items>
            </DropdownMenu>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenu.Button>
            <Button
              size="sm"
              label="Share"
              icon={ArrowUpOnSquareIcon}
              variant="secondary"
            />
          </DropdownMenu.Button>
          <DropdownMenu.Items width={280}>
            <div className="flex flex-col gap-y-4 p-4">
              <div className="flex flex-col gap-y-2">
                <div className="grow text-sm font-medium text-element-800">
                  Share this conversation with others
                </div>
                <div className="text-sm font-normal text-element-700">
                  Share the conversation link with other members of your
                  workspace to invite them to contribute.
                </div>
              </div>
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  label={copyLinkSuccess ? "Copied!" : "Copy the link"}
                  icon={copyLinkSuccess ? ClipboardCheckIcon : LinkStrokeIcon}
                  onClick={handleClick}
                />
              </div>
            </div>
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
    </div>
  );
}
