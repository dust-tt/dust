import { useCreatePodFolder } from "@app/lib/swr/pods";
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
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useRef, useState } from "react";

interface CreateFolderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  owner: LightWorkspaceType;
  parentRelativePath: string;
  podId: string;
}

export function CreateFolderDialog({
  isOpen,
  onClose,
  onCreated,
  owner,
  parentRelativePath,
  podId,
}: CreateFolderDialogProps) {
  const { t } = useLingui();
  const [folderName, setFolderName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const createFolder = useCreatePodFolder({ owner, podId: podId });

  useEffect(() => {
    if (isOpen) {
      setFolderName("");
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [isOpen]);

  const handleCreate = useCallback(async () => {
    if (!folderName.trim() || isCreating) {
      return;
    }

    setIsCreating(true);
    try {
      const result = await createFolder({
        folderName: folderName.trim(),
        parentRelativePath,
      });
      if (result.isOk()) {
        await onCreated();
        onClose();
      }
    } finally {
      setIsCreating(false);
    }
  }, [
    createFolder,
    folderName,
    isCreating,
    onClose,
    onCreated,
    parentRelativePath,
  ]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>New folder</Trans>
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <Input
            ref={inputRef}
            placeholder={t`Folder name`}
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleCreate();
              }
            }}
          />
        </DialogContainer>
        <DialogFooter
          rightButtonProps={{
            label: t`Create`,
            variant: "primary",
            onClick: handleCreate,
            disabled: !folderName.trim() || isCreating,
            isLoading: isCreating,
          }}
          leftButtonProps={{
            label: t`Cancel`,
            variant: "outline",
            disabled: isCreating,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
