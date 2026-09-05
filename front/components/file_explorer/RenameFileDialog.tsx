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
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

/**
 * `path` is the canonical scoped path of the item to rename. For a Frame it is the source folder
 * of the Frame package; the server moves the whole package along with it.
 */
export type RenameMountItem =
  | { kind: "file"; path: string; name: string }
  | { kind: "folder"; path: string; name: string }
  | { kind: "frame"; path: string; name: string };

const DIALOG_TITLES: Record<RenameMountItem["kind"], string> = {
  file: "Rename file",
  folder: "Rename folder",
  frame: "Rename Frame",
};

const INPUT_PLACEHOLDERS: Record<RenameMountItem["kind"], string> = {
  file: "Enter new file name...",
  folder: "Enter new folder name...",
  frame: "Enter new Frame name...",
};

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

  const kind = item?.kind ?? "file";

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
          <DialogTitle>{DIALOG_TITLES[kind]}</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="flex items-center gap-1">
            <Input
              ref={inputRef}
              placeholder={INPUT_PLACEHOLDERS[kind]}
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
            {kind === "file" && extension && (
              <span className="text-sm text-muted-foreground">{extension}</span>
            )}
          </div>
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
