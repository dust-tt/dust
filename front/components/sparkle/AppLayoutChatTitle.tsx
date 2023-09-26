import {
  ArrowUpOnSquareIcon,
  Button,
  ClipboardCheckIcon,
  DropdownMenu,
  LinkStrokeIcon,
  SliderToggle,
  TrashIcon,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

import { ChatSessionVisibility } from "@app/types/chat";

export function AppLayoutChatTitle({
  readOnly,
  title,
  shareLink,
  onDelete,
  visibility,
  onUpdateVisibility,
}: {
  readOnly?: boolean;
  title: string;
  shareLink: string;
  onDelete?: () => void;
  visibility: ChatSessionVisibility;
  onUpdateVisibility: (visibility: ChatSessionVisibility) => void;
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

      <div className="hidden space-x-1 lg:flex">
        {!readOnly && onDelete && (
          <div className="flex flex-initial">
            <Button
              size="sm"
              labelVisible={false}
              tooltipPosition="below"
              variant="secondaryWarning"
              label="Delete"
              icon={TrashIcon}
              onClick={onDelete}
            />
          </div>
        )}

        {!readOnly && (
          <>
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
                <div className="flex flex-col gap-y-4 px-4 py-4">
                  <div className="flex flex-col gap-y-2">
                    <div className="flex flex-row">
                      <div className="grow text-sm font-medium text-element-800">
                        Share with the Workspace
                      </div>
                      <div>
                        <SliderToggle
                          selected={visibility === "workspace"}
                          onClick={() => {
                            onUpdateVisibility(
                              visibility === "workspace"
                                ? "private"
                                : "workspace"
                            );
                          }}
                        />
                      </div>
                    </div>

                    <div className="text-sm font-normal text-element-700">
                      Make visible to all your co-workers in "All
                      conversations".
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <Button
                      variant="secondary"
                      size="sm"
                      label={copyLinkSuccess ? "Copied!" : "Copy the link"}
                      icon={
                        copyLinkSuccess ? ClipboardCheckIcon : LinkStrokeIcon
                      }
                      onClick={handleClick}
                    />
                  </div>
                </div>
              </DropdownMenu.Items>
            </DropdownMenu>
          </>
        )}
      </div>
    </div>
  );
}
