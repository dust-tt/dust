import { useImportFolderArchive } from "@app/lib/swr/files";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useRef, useState } from "react";

interface ImportFrameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void | Promise<void>;
  owner: LightWorkspaceType;
  /** Canonical scoped path of the folder the Frame folder is created in, e.g. `pod-{id}/apps`. */
  parentCanonicalPath: string;
}

function defaultFolderName(fileName: string): string {
  return fileName.replace(/\.zip$/i, "");
}

export function ImportFrameDialog({
  isOpen,
  onClose,
  onImported,
  owner,
  parentCanonicalPath,
}: ImportFrameDialogProps) {
  const [archive, setArchive] = useState<File | null>(null);
  const [folderName, setFolderName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFolderArchive = useImportFolderArchive({ owner });

  useEffect(() => {
    if (isOpen) {
      setArchive(null);
      setFolderName("");
    }
  }, [isOpen]);

  const trimmedFolderName = folderName.trim();
  const canImport =
    archive !== null && trimmedFolderName.length > 0 && !isImporting;

  const handleImport = useCallback(async () => {
    if (!archive || !trimmedFolderName || isImporting) {
      return;
    }

    setIsImporting(true);
    try {
      const result = await importFolderArchive({
        folderCanonicalPath: `${parentCanonicalPath}/${trimmedFolderName}`,
        file: archive,
      });
      if (result.isOk()) {
        await onImported();
        onClose();
      }
    } finally {
      setIsImporting(false);
    }
  }, [
    archive,
    importFolderArchive,
    isImporting,
    onClose,
    onImported,
    parentCanonicalPath,
    trimmedFolderName,
  ]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Frame</DialogTitle>
          <DialogDescription>
            Upload a Frame zip, as downloaded from a Frame's menu. Its files are
            extracted into a new folder here.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => {
                const selected = e.target.files?.[0] ?? null;
                setArchive(selected);
                if (selected && !trimmedFolderName) {
                  setFolderName(defaultFolderName(selected.name));
                }
              }}
            />
            <Input
              placeholder="Folder name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleImport();
                }
              }}
            />
          </div>
        </DialogContainer>
        <DialogFooter
          rightButtonProps={{
            label: "Import",
            variant: "primary",
            onClick: handleImport,
            disabled: !canImport,
            isLoading: isImporting,
          }}
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            disabled: isImporting,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
