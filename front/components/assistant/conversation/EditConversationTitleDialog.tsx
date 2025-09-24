import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@dust-tt/sparkle";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";

type EditConversationTitleDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  ownerId: string;
  conversationId: string;
  currentTitle: string;
};

export const EditConversationTitleDialog = ({
  isOpen,
  onClose,
  ownerId,
  conversationId,
  currentTitle,
}: EditConversationTitleDialogProps) => {
  const { mutate } = useSWRConfig();
  const [title, setTitle] = useState<string>(currentTitle);
  const sendNotification = useSendNotification();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(currentTitle);
      // Focus the input after the dialog has opened
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [isOpen, currentTitle]);

  const editTitle = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/w/${ownerId}/assistant/conversations/${conversationId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title }),
        }
      );
      if (!res.ok) {
        throw new Error("Failed to update title");
      }
      await mutate(
        `/api/w/${ownerId}/assistant/conversations/${conversationId}`
      );
      void mutate(`/api/w/${ownerId}/assistant/conversations`);
      sendNotification({ type: "success", title: "Title edited" });
    } catch (e) {
      sendNotification({ type: "error", title: "Failed to edit title" });
    }
  }, [conversationId, mutate, ownerId, title, sendNotification]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit conversation title</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <Input
            ref={inputRef}
            placeholder="Enter new title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void editTitle();
                onClose();
              }
            }}
          />
        </DialogContainer>
        <DialogFooter
          rightButtonProps={{
            label: "Save",
            variant: "primary",
            onClick: editTitle,
          }}
          leftButtonProps={{
            label: "Cancel",
            variant: "secondary",
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
