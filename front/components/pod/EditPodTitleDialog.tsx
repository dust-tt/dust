import { usePodConversationsSummary } from "@app/hooks/conversations";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useCheckPodName } from "@app/lib/swr/pods";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { getErrorFromResponse } from "@app/lib/swr/swr";
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

type EditPodTitleDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
  podId: string;
  currentTitle: string;
};

export const EditPodTitleDialog = ({
  isOpen,
  onClose,
  owner,
  podId,
  currentTitle,
}: EditPodTitleDialogProps) => {
  const [title, setTitle] = useState<string>(currentTitle);
  const {
    isNameAvailable,
    isChecking: isCheckingName,
    setValue: setNameToCheck,
  } = useCheckPodName({
    owner,
    whitelistedName: currentTitle,
  });
  const nameNotAvailable =
    title.trim().length > 0 && !isCheckingName && !isNameAvailable;
  const inputRef = useRef<HTMLInputElement>(null);
  const sendNotification = useSendNotification();
  const { mutateSpaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: podId,
    disabled: true, // Needed just to mutate
  });
  const { mutate: mutatePodConversationsSummary } = usePodConversationsSummary({
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

    const response = await clientFetch(`/api/w/${owner.sId}/spaces/${podId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: trimmedTitle }),
    });

    if (!response.ok) {
      const errorData = await getErrorFromResponse(response);
      sendNotification({
        type: "error",
        title: "Failed to edit title",
        description: errorData.message,
      });
      return;
    }

    void mutateSpaceInfo();
    void mutatePodConversationsSummary();

    sendNotification({ type: "success", title: "Title edited" });
    onClose();
  }, [
    title,
    currentTitle,
    owner.sId,
    podId,
    mutateSpaceInfo,
    mutatePodConversationsSummary,
    sendNotification,
    onClose,
  ]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Pod name</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <Input
            ref={inputRef}
            placeholder="Enter new name..."
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setNameToCheck(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void editTitle();
              }
            }}
          />
          {nameNotAvailable && (
            <div className="text-xs text-warning-500">
              A Pod or space with this name already exists.
            </div>
          )}
        </DialogContainer>
        <DialogFooter
          rightButtonProps={{
            label: "Save",
            variant: "primary",
            onClick: editTitle,
            disabled: nameNotAvailable || isCheckingName,
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
