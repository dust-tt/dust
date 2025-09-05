import {
  Button,
  CheckIcon,
  Input,
  PencilSquareIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { MouseEvent } from "react";
import { useCallback, useRef, useState } from "react";
import { useSWRConfig } from "swr";

import { ConversationFilesPopover } from "@app/components/assistant/conversation/ConversationFilesPopover";
import { ConversationMenu } from "@app/components/assistant/conversation/ConversationMenu";
import { useConversationsNavigation } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useConversation } from "@app/lib/swr/conversations";
import type { WorkspaceType } from "@app/types";

export function ConversationTitle({
  owner,
  baseUrl,
}: {
  owner: WorkspaceType;
  baseUrl: string;
}) {
  const { mutate } = useSWRConfig();
  const { activeConversationId } = useConversationsNavigation();

  const { conversation } = useConversation({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
  });

  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [editedTitle, setEditedTitle] = useState<string>("");

  const titleInputFocused = useRef(false);
  const saveButtonFocused = useRef(false);

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
          <ConversationFilesPopover
            conversationId={activeConversationId}
            owner={owner}
          />
          <ConversationMenu
            activeConversationId={activeConversationId}
            conversation={conversation}
            baseUrl={baseUrl}
            owner={owner}
          />
        </div>
      </div>
    </AppLayoutTitle>
  );
}
