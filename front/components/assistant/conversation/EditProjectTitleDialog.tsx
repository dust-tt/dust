import { useSpaceConversationsSummary } from "@app/hooks/conversations";
import { useSendNotification } from "@app/hooks/useNotification";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { useFetcher } from "@app/lib/swr/swr";
import { isAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@dust-tt/sparkle";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useCallback, useEffect, useRef, useState } from "react";

type EditProjectTitleDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
  spaceId: string;
  currentTitle: string;
};

export const EditProjectTitleDialog = ({
  isOpen,
  onClose,
  owner,
  spaceId,
  currentTitle,
}: EditProjectTitleDialogProps) => {
  const [title, setTitle] = useState<string>(currentTitle);
  const inputRef = useRef<HTMLInputElement>(null);
  const sendNotification = useSendNotification();
  const { fetcherWithBody } = useFetcher();
  const { mutateSpaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId,
    disabled: true, // Needed just to mutate
  });
  const { mutate: mutateSpaceSummary } = useSpaceConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
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
    const trimmedTitle = title.trim();
    if (!trimmedTitle || trimmedTitle === currentTitle) {
      onClose();
      return;
    }

    try {
      await fetcherWithBody([
        `/api/w/${owner.sId}/spaces/${spaceId}`,
        { name: trimmedTitle },
        "PATCH",
      ]);

      void mutateSpaceInfo();
      void mutateSpaceSummary();

      sendNotification({ type: "success", title: "Title edited" });
      onClose();
    } catch (e) {
      if (isAPIErrorResponse(e)) {
        sendNotification({
          type: "error",
          title: "Failed to edit title",
          description: e.error.message,
        });
      } else {
        sendNotification({
          type: "error",
          title: "Failed to edit title",
          description: "An error occurred",
        });
      }
    }
  }, [
    title,
    currentTitle,
    owner.sId,
    spaceId,
    fetcherWithBody,
    mutateSpaceInfo,
    mutateSpaceSummary,
    sendNotification,
    onClose,
  ]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project title</DialogTitle>
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
            variant: "outline",
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
