import {
  ArrowUpOnSquareIcon,
  Button,
  CheckIcon,
  ClipboardCheckIcon,
  Dialog,
  IconButton,
  LinkStrokeIcon,
  PencilSquareIcon,
  Popover,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { ConversationType } from "@dust-tt/types";
import type { MouseEvent } from "react";
import React, { useRef, useState } from "react";
import { useSWRConfig } from "swr";

import { ConversationParticipants } from "@app/components/assistant/conversation/ConversationParticipants";
import { classNames } from "@app/lib/utils";

export function ConversationTitle({
  owner,
  conversation,
  shareLink,
  onDelete,
}: {
  owner: WorkspaceType;
  conversation: ConversationType;
  shareLink: string;
  onDelete?: (conversationId: string) => void;
}) {
  const { mutate } = useSWRConfig();

  const [copyLinkSuccess, setCopyLinkSuccess] = useState<boolean>(false);
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false);
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

  const onTitleChange = async (title: string) => {
    try {
      const res = await fetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversation.sId}`,
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
        `/api/w/${owner.sId}/assistant/conversations/${conversation.sId}`
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

  return (
    <>
      {onDelete && (
        <DeleteConversationDialog
          show={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          onDelete={() => {
            setShowDeleteDialog(false);
            onDelete(conversation.sId);
          }}
        />
      )}
      <div className="grid h-full min-w-0 max-w-full grid-cols-[1fr,auto] items-center gap-4">
        <div className="flex min-w-0 flex-row items-center gap-4">
          {!isEditingTitle ? (
            <div className="min-w-0 overflow-hidden truncate">
              <span className="font-bold">{conversation.title || ""}</span>
            </div>
          ) : (
            <div className="w-[84%]">
              <input
                className={classNames(
                  "border-0 bg-transparent outline-none ring-1 ring-structure-200 focus:outline-none focus:ring-2",
                  "w-full rounded-md py-1.5 pl-4 pr-8 placeholder-element-600",
                  "transition-all duration-300 ease-out focus:ring-action-300"
                )}
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
            <div className="flex flex-row gap-2">
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
                setEditedTitle(conversation.title || "");
                setIsEditingTitle(true);
              }}
              size="sm"
              variant="tertiary"
            />
          )}
        </div>
        <div className="flex items-center">
          <div className="hidden pr-6 lg:flex">
            <ConversationParticipants
              conversationId={conversation.sId}
              owner={owner}
            />
          </div>
          <Button.List>
            <div className="hidden lg:flex">
              {onDelete && (
                <Button
                  size="sm"
                  labelVisible={false}
                  tooltipPosition="bottom"
                  variant="tertiary"
                  label="Delete Conversation"
                  icon={TrashIcon}
                  onClick={() => setShowDeleteDialog(true)}
                />
              )}
            </div>
            <Popover
              trigger={
                <>
                  <div className="hidden sm:flex">
                    <Button
                      size="sm"
                      label="Share"
                      icon={ArrowUpOnSquareIcon}
                      variant="tertiary"
                    />
                  </div>
                  <div className="flex sm:hidden">
                    <Button
                      size="sm"
                      label="Share"
                      labelVisible={false}
                      icon={ArrowUpOnSquareIcon}
                      variant="tertiary"
                    />
                  </div>
                </>
              }
              content={
                <div className="flex flex-col gap-y-4 py-4">
                  <div className="text-sm font-normal text-element-700">
                    Share the conversation link with other members of your
                    workspace to invite them to contribute.
                  </div>
                  <div className="flex">
                    <Button
                      variant="primary"
                      size="sm"
                      label={copyLinkSuccess ? "Copied!" : "Copy the link"}
                      icon={
                        copyLinkSuccess ? ClipboardCheckIcon : LinkStrokeIcon
                      }
                      onClick={handleClick}
                    />
                  </div>
                </div>
              }
            />
          </Button.List>
        </div>
      </div>
    </>
  );
}

function DeleteConversationDialog({
  show,
  onClose,
  onDelete,
}: {
  show: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <Dialog
      isOpen={show}
      title={"Deleting the conversation"}
      onCancel={onClose}
      validateLabel="Delete for everyone"
      validateVariant="primaryWarning"
      onValidate={onDelete}
    >
      <div className="flex flex-col gap-2">
        <div>
          <div>
            <span className="font-bold">Are you sure you want to delete?</span>{" "}
          </div>
          This will delete the conversation for everyone.
        </div>
      </div>
    </Dialog>
  );
}
