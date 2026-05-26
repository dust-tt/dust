import {
  getParentFolderRelativePath,
  getScopedRelativePath,
} from "@app/components/file_explorer/utils";
import { cn } from "@app/components/poke/shadcn/lib/utils";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

/** Drop-target highlight for folder / go-up cards (owned by card wrappers, not FileExplorerItem). */
export const fileExplorerDropActiveClasses = cn(
  "ring-2 ring-highlight-400 ring-inset dark:ring-highlight-400-night",
  "bg-highlight-100 dark:bg-highlight-100-night"
);

export function getFileExplorerDropSurfaceClassName(
  isDragOver: boolean
): string | undefined {
  return isDragOver ? fileExplorerDropActiveClasses : undefined;
}

/** Drag payload MIME type for file explorer file moves. */
export const FILE_EXPLORER_DRAG_MIME = "application/x-dust-file-explorer-file";

export function setFileExplorerDragData(
  dataTransfer: DataTransfer,
  scopedFilePath: string
): void {
  dataTransfer.effectAllowed = "move";
  dataTransfer.setData(FILE_EXPLORER_DRAG_MIME, scopedFilePath);
}

export function getFileExplorerDragScopedPath(
  dataTransfer: DataTransfer
): string | null {
  const path = dataTransfer.getData(FILE_EXPLORER_DRAG_MIME);
  return path.length > 0 ? path : null;
}

export function hasFileExplorerDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(FILE_EXPLORER_DRAG_MIME);
}

export function getCurrentParentRelativePath(fileScopedPath: string): string {
  return getParentFolderRelativePath(getScopedRelativePath(fileScopedPath));
}

export function canMoveFileToParentFolder(
  fileScopedPath: string,
  targetParentRelativePath: string
): boolean {
  return (
    getCurrentParentRelativePath(fileScopedPath) !== targetParentRelativePath
  );
}

/** True for the lifetime of a file-explorer drag operation (dragstart → dragend/drop). */
export function useIsFileExplorerDragging(): boolean {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const start = (e: DragEvent) => {
      if (e.dataTransfer && hasFileExplorerDrag(e.dataTransfer)) {
        setIsDragging(true);
      }
    };
    const stop = () => setIsDragging(false);

    document.addEventListener("dragstart", start);
    document.addEventListener("dragend", stop);
    document.addEventListener("drop", stop);

    return () => {
      document.removeEventListener("dragstart", start);
      document.removeEventListener("dragend", stop);
      document.removeEventListener("drop", stop);
    };
  }, []);

  return isDragging;
}

export function useFileExplorerDropTarget({
  disabled,
  onDrop,
}: {
  disabled?: boolean;
  onDrop: (scopedFilePath: string) => void;
}) {
  const dragCounterRef = useRef(0);
  const [isDragOver, setIsDragOver] = useState(false);

  const reset = useCallback(() => {
    dragCounterRef.current = 0;
    setIsDragOver(false);
  }, []);

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (disabled || !hasFileExplorerDrag(e.dataTransfer)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current += 1;
      if (dragCounterRef.current === 1) {
        setIsDragOver(true);
      }
    },
    [disabled]
  );

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (disabled || !hasFileExplorerDrag(e.dataTransfer)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
    },
    [disabled]
  );

  const onDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (disabled || !hasFileExplorerDrag(e.dataTransfer)) {
        return;
      }
      e.stopPropagation();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        reset();
      }
    },
    [disabled, reset]
  );

  const onDropHandler = useCallback(
    (e: React.DragEvent) => {
      if (disabled) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      reset();

      const scopedFilePath = getFileExplorerDragScopedPath(e.dataTransfer);
      if (!scopedFilePath) {
        return;
      }
      onDrop(scopedFilePath);
    },
    [disabled, onDrop, reset]
  );

  return {
    isDragOver,
    dropTargetProps: {
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDrop: onDropHandler,
    },
  };
}
