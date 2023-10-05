import {
  ArrowUpOnSquareIcon,
  Button,
  CheckIcon,
  ClipboardCheckIcon,
  DropdownMenu,
  IconButton,
  LinkStrokeIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React, { MouseEvent, useRef, useState } from "react";
import { useSWRConfig } from "swr";

import { ConversationParticipants } from "@app/components/assistant/conversation/ConversationParticipants";
import { useConversation } from "@app/lib/swr";
import { WorkspaceType } from "@app/types/user";

export function ConversationTitle({
  owner,
  conversationId,
  shareLink,
  onDelete,
}: {
  owner: WorkspaceType;
  conversationId: string;
  shareLink: string;
  onDelete?: () => void;
}) {
  const { mutate } = useSWRConfig();

  const [copyLinkSuccess, setCopyLinkSuccess] = useState<boolean>(false);
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [editedTitle, setEditedTitle] = useState<string>("");

  const titleInputFocused = useRef(false);
  const saveButtonFocused = useRef(false);

  const handleClick = async () => {
    await navigator.clipboard.writeText(shareLink || "");
    setCopyLinkSuccess(true);
    setTimeout(() => {
      setCopyLinkSuccess(false);
    }, 1000);
  };

  const { conversation, isConversationError, isConversationLoading } =
    useConversation({
      conversationId,
      workspaceId: owner.sId,
    });

  const onTitleChange = async (title: string) => {
    try {
      const res = await fetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            visibility: conversation?.visibility,
          }),
        }
      );
      await mutate(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}`
      );
      void mutate(`/api/w/${owner.sId}/assistant/conversations`);
      if (!res.ok) {
        throw new Error("Failed to update title");
      }
      setIsEditingTitle(false);
      setEditedTitle("");
    } catch (e) {
      alert("Failed to update title");
    }
  };

  if (isConversationLoading || isConversationError || !conversation) {
    return null;
  }

  return (
    <div className="grid h-full min-w-0 max-w-full grid-cols-[1fr,auto] items-center gap-4">
      <div className="flex min-w-0 flex-row items-center gap-4">
        {!isEditingTitle ? (
          <div className="min-w-0 overflow-hidden truncate">
            <span className="font-bold">{conversation?.title || ""}</span>
          </div>
        ) : (
          <div className="flex-grow">
            <input
              className="w-full rounded-md font-bold"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              // We need to make sure the click on the save button below
              // is registered before the onBlur event, so we keep track of the
              // focus state of both the input and the save button.
              onFocus={() => (titleInputFocused.current = true)}
              onBlur={() => {
                setTimeout(() => {
                  if (!saveButtonFocused.current) {
                    setIsEditingTitle(false);
                  }
                  titleInputFocused.current = false;
                }, 0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  return onTitleChange(editedTitle);
                }
              }}
              autoFocus
            />
          </div>
        )}

        {isEditingTitle ? (
          <div className="flex flex-row gap-1">
            <div
              onClick={(e: MouseEvent<HTMLDivElement>) => {
                e.preventDefault();
                return onTitleChange(editedTitle);
              }}
              // See comment on the input above.
              onFocus={() => (saveButtonFocused.current = true)}
              onBlur={() => {
                setTimeout(() => {
                  if (!titleInputFocused.current) {
                    setIsEditingTitle(false);
                  }
                  saveButtonFocused.current = false;
                }, 0);
              }}
              className="flex items-center"
            >
              <IconButton icon={CheckIcon} variant="secondary" />
            </div>
            <IconButton
              icon={XMarkIcon}
              onClick={() => {
                setIsEditingTitle(false);
                setEditedTitle("");
              }}
              variant="secondary"
            />
          </div>
        ) : (
          <IconButton
            icon={PencilSquareIcon}
            onClick={() => {
              setEditedTitle(conversation?.title || "");
              setIsEditingTitle(true);
            }}
            size="sm"
            variant="secondary"
          />
        )}
      </div>
      <div className="flex items-center">
        <div className="hidden pr-6 lg:flex">
          <ConversationParticipants conversation={conversation} />
        </div>
        <Button.List>
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
        </Button.List>
      </div>
    </div>
  );
}
