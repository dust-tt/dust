import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

export type AddablePodTabFile = {
  path: string;
  fileName: string;
  contentType: string;
};

interface AddPodFileMenuProps {
  files: AddablePodTabFile[];
  onSelect: (file: AddablePodTabFile) => void;
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
}

export function AddPodFileMenu({
  files,
  onSelect,
  trigger,
  open,
  onOpenChange,
  align = "start",
}: AddPodFileMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [search, setSearch] = useState("");
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolledOpen;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
    if (!nextOpen) {
      setSearch("");
    }
  };

  const filteredFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return files;
    }

    return files.filter((file) => file.fileName.toLowerCase().includes(query));
  }, [files, search]);

  return (
    <DropdownMenu modal={false} open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-[280px]"
        dropdownHeaders={
          files.length > 0 ? (
            <DropdownMenuSearchbar
              autoFocus
              name="add-file-search"
              placeholder="Search files"
              value={search}
              onChange={setSearch}
            />
          ) : undefined
        }
      >
        {files.length === 0 ? (
          <div className="flex h-16 items-center justify-center px-3 text-sm text-muted-foreground">
            No files to add
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex h-16 items-center justify-center px-3 text-sm text-muted-foreground">
            No files found
          </div>
        ) : (
          filteredFiles.map((file) => (
            <DropdownMenuItem
              key={file.path}
              label={file.fileName}
              icon={getFileTypeIcon(file.contentType, file.fileName)}
              onClick={() => {
                handleOpenChange(false);
                onSelect(file);
              }}
            />
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
