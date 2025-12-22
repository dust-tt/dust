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

import { useUpdateConversationTitle } from "@app/hooks/useUpdateConversationTitle";
import type { LightWorkspaceType } from "@app/types";

type EditConversationTitleDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
  conversationId: string;
  currentTitle: string;
};

export const EditConversationTitleDialog = ({
  isOpen,
  onClose,
  owner,
  conversationId,
  currentTitle,
}: EditConversationTitleDialogProps) => {
  const [title, setTitle] = useState<string>(currentTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateTitle = useUpdateConversationTitle({
    owner,
    conversationId,
  });

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
    await updateTitle(title);
  }, [title, updateTitle]);

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
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
