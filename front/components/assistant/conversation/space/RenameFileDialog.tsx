import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@dust-tt/sparkle";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { ProjectFileType } from "@app/lib/swr/projects";
import { useRenameProjectFile } from "@app/lib/swr/projects";
import type { LightWorkspaceType } from "@app/types";

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

interface RenameFileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRenamed: () => void;
  owner: LightWorkspaceType;
  file: ProjectFileType | null;
}

export function RenameFileDialog({
  isOpen,
  onClose,
  onRenamed,
  owner,
  file,
}: RenameFileDialogProps) {
  const [baseName, setBaseName] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const renameFile = useRenameProjectFile({ owner });

  const extension = useMemo(() => {
    if (!file) {
      return "";
    }
    return splitFileName(file.fileName).extension;
  }, [file]);

  useEffect(() => {
    if (isOpen && file) {
      const { baseName: initialBaseName } = splitFileName(file.fileName);
      setBaseName(initialBaseName);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [isOpen, file]);

  const handleRename = useCallback(async () => {
    if (!file || !baseName.trim()) {
      return;
    }
    const newFileName = baseName.trim() + extension;
    const result = await renameFile(file.sId, newFileName);
    if (result.isOk()) {
      onRenamed();
      onClose();
    }
  }, [file, baseName, extension, renameFile, onRenamed, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename file</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="flex items-center gap-1">
            <Input
              ref={inputRef}
              placeholder="Enter new file name..."
              value={baseName}
              onChange={(e) => setBaseName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleRename();
                }
              }}
            />
            {extension && (
              <span className="text-sm text-muted-foreground">{extension}</span>
            )}
          </div>
        </DialogContainer>
        <DialogFooter
          rightButtonProps={{
            label: "Rename",
            variant: "primary",
            onClick: handleRename,
            disabled: !baseName.trim(),
          }}
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
