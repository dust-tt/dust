import {
  ArrowUpOnSquareIcon,
  Button,
  CheckIcon,
  ClipboardCheckIcon,
  Input,
  LinkIcon,
  PencilSquareIcon,
  Popover,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { MouseEvent } from "react";
import React, { useCallback, useRef, useState } from "react";
import { useSWRConfig } from "swr";

import { useConversationsNavigation } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { DeleteConversationsDialog } from "@app/components/assistant/conversation/DeleteConversationsDialog";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import {
  useConversation,
  useDeleteConversation,
} from "@app/lib/swr/conversations";
import type { WorkspaceType } from "@app/types";

export function ConversationTitle({
  owner,
  baseUrl,
}: {
  owner: WorkspaceType;
  baseUrl: string;
}) {
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const { activeConversationId } = useConversationsNavigation();

  const { conversation } = useConversation({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
  });

  const shareLink = `${baseUrl}/w/${owner.sId}/assistant/${activeConversationId}`;

  const doDelete = useDeleteConversation(owner);

  const onDelete = useCallback(async () => {
    const res = await doDelete(conversation);
    if (res) {
      void router.push(`/w/${owner.sId}/assistant/new`);
    }
  }, [conversation, doDelete, owner.sId, router]);

  const [copyLinkSuccess, setCopyLinkSuccess] = useState<boolean>(false);
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false);
  const [editedTitle, setEditedTitle] = useState<string>("");

  const titleInputFocused = useRef(false);
  const saveButtonFocused = useRef(false);

  const handleClick = useCallback(async () => {
    await navigator.clipboard.writeText(shareLink || "");
    setCopyLinkSuccess(true);
    setTimeout(() => {
      setCopyLinkSuccess(false);
    }, 1000);
  }, [shareLink]);

  const onTitleChange = useCallback(
    async (title: string) => {
      try {
        const res = await fetch(
          `/api/w/${owner.sId}/assistant/conversations/${activeConversationId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ title }),
          }
        );
        await mutate(
          `/api/w/${owner.sId}/assistant/conversations/${activeConversationId}`
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
    },
    [activeConversationId, mutate, owner.sId]
  );

  if (!activeConversationId) {
    return null;
  }

  return (
    <>
      <DeleteConversationsDialog
        isOpen={showDeleteDialog}
        type="selection"
        selectedCount={1}
        onClose={() => setShowDeleteDialog(false)}
        onDelete={() => {
          setShowDeleteDialog(false);
          void onDelete();
        }}
      />
      <AppLayoutTitle>
        <div className="grid h-full min-w-0 max-w-full grid-cols-[1fr,auto] items-center gap-4">
          <div className="flex min-w-0 flex-row items-center gap-4 text-primary dark:text-primary-night">
            {!isEditingTitle ? (
              <div className="dd-privacy-mask min-w-0 overflow-hidden truncate text-sm font-normal">
                {conversation?.title || ""}
              </div>
            ) : (
              <div className="w-[84%]">
                <Input
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
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
                  <Button size="mini" icon={CheckIcon} variant="primary" />
                </div>
                <Button
                  icon={XMarkIcon}
                  size="mini"
                  onClick={() => {
                    setIsEditingTitle(false);
                    setEditedTitle("");
                  }}
                  variant="outline"
                />
              </div>
            ) : (
              <Button
                icon={PencilSquareIcon}
                onClick={() => {
                  setEditedTitle(conversation?.title || "");
                  setIsEditingTitle(true);
                }}
                size="mini"
                variant="ghost-primary"
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              tooltip="Delete Conversation"
              icon={TrashIcon}
              onClick={() => setShowDeleteDialog(true)}
            />
            <Popover
              popoverTriggerAsChild
              trigger={
                <div>
                  <div className="hidden sm:flex">
                    <Button
                      size="sm"
                      label="Share"
                      icon={ArrowUpOnSquareIcon}
                      variant="ghost"
                    />
                  </div>
                  <div className="flex sm:hidden">
                    <Button
                      size="sm"
                      tooltip="Share"
                      icon={ArrowUpOnSquareIcon}
                      variant="ghost"
                    />
                  </div>
                </div>
              }
              content={
                <div className="flex flex-col gap-y-4">
                  <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                    Share the conversation link with other members of your
                    workspace to invite them to contribute.
                  </div>
                  <div className="flex">
                    <Button
                      variant="primary"
                      size="sm"
                      label={copyLinkSuccess ? "Copied!" : "Copy the link"}
                      icon={copyLinkSuccess ? ClipboardCheckIcon : LinkIcon}
                      onClick={handleClick}
                    />
                  </div>
                </div>
              }
            />
          </div>
        </div>
      </AppLayoutTitle>
    </>
  );
}
