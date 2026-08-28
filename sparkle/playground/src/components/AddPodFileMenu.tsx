import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  File02,
} from "@dust-tt/sparkle";
import { useMemo, useState, type ReactNode } from "react";

import { getDataSourceIcon } from "../data/dataSources";
import type { DataSource } from "../data/types";

interface AddPodFileMenuProps {
  files: DataSource[];
  onSelect: (file: DataSource) => void;
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
              key={file.id}
              label={file.fileName}
              icon={getDataSourceIcon(file) ?? File02}
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
