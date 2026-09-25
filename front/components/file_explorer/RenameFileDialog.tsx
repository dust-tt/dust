import { useRenameFileByPath } from "@app/lib/swr/files";
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const RENAME_DIALOG_TITLES: Record<RenameMountItem["kind"], string> = {
  file: "Rename file",
  folder: "Rename folder",
  frame: "Rename Frame",
};

function splitFileName(fileName: string): {
  baseName: string;
  extension: string;
} {
  const lastDotIndex = fileName.lastIndexOf(".");
  if (lastDotIndex === -1 || lastDotIndex === 0) {
    return { baseName: fileName, extension: "" };
  }
  return {
    baseName: fileName.slice(0, lastDotIndex),
    extension: fileName.slice(lastDotIndex),
  };
}

export type RenameMountItem =
  | { kind: "file"; path: string; name: string }
  | { kind: "folder"; path: string; name: string }
  // A Frame is named by the folder holding its manifest, so it renames as that folder.
  | { kind: "frame"; path: string; name: string };

interface RenameFileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRenamed: () => void;
  owner: LightWorkspaceType;
  item: RenameMountItem | null;
}

export function RenameFileDialog({
  isOpen,
  onClose,
  onRenamed,
  owner,
  item,
}: RenameFileDialogProps) {
  const [name, setName] = useState<string>("");
  const [isRenaming, setIsRenaming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const renameFile = useRenameFileByPath({ owner });

  const extension = useMemo(() => {
    if (!item || item.kind !== "file") {
      return "";
    }
    return splitFileName(item.name).extension;
  }, [item]);

  const displayName = useMemo(() => {
    if (!item || item.kind !== "file") {
      return name;
    }
    return name + extension;
  }, [extension, item, name]);

  useEffect(() => {
    if (isOpen && item) {
      setIsRenaming(false);
      if (item.kind === "file") {
        const { baseName: initialBaseName } = splitFileName(item.name);
        setName(initialBaseName);
      } else {
        setName(item.name);
      }
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [isOpen, item]);

  const handleRename = useCallback(async () => {
    if (!item || !name.trim() || isRenaming) {
      return;
    }
    const newName =
      item.kind === "file" ? name.trim() + extension : name.trim();
    setIsRenaming(true);
    try {
      const result = await renameFile(item.path, newName);
      if (result.isOk()) {
        onRenamed();
        onClose();
      }
    } finally {
      setIsRenaming(false);
    }
  }, [item, name, extension, isRenaming, renameFile, onRenamed, onClose]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isRenaming) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {RENAME_DIALOG_TITLES[item?.kind ?? "file"]}
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          {item?.kind !== "file" ? (
            <Input
              ref={inputRef}
              placeholder="Enter new name..."
              value={name}
              disabled={isRenaming}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleRename();
                }
              }}
            />
          ) : (
            <div className="flex items-center gap-1">
              <Input
                ref={inputRef}
                placeholder="Enter new file name..."
                value={name}
                disabled={isRenaming}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleRename();
                  }
                }}
              />
              {extension && (
                <span className="text-sm text-muted-foreground">
                  {extension}
                </span>
              )}
            </div>
          )}
        </DialogContainer>
        <DialogFooter
          rightButtonProps={{
            label: "Rename",
            variant: "primary",
            onClick: handleRename,
            disabled: !displayName.trim() || isRenaming,
            isLoading: isRenaming,
          }}
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            disabled: isRenaming,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
