import {
  canMoveFileToParentFolder,
  useFileExplorerDropTarget,
  useIsFileExplorerDragging,
} from "@app/components/file_explorer/fileExplorerDragDrop";
import {
  getFolderBreadcrumbSegments,
  ROOT_FOLDER_LABEL,
} from "@app/components/file_explorer/utils";
import {
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbItem,
  BreadcrumbPage,
  cn,
} from "@dust-tt/sparkle";
import type React from "react";

interface BreadcrumbDropZoneProps {
  disabled: boolean;
  parentRelativePath: string;
  onMoveFileDrop?: (scopedFilePath: string, parentRelativePath: string) => void;
  children: React.ReactNode;
}

function BreadcrumbDropZone({
  disabled,
  parentRelativePath,
  onMoveFileDrop,
  children,
}: BreadcrumbDropZoneProps) {
  const { isDragOver, dropTargetProps } = useFileExplorerDropTarget({
    disabled,
    onDrop: (scopedFilePath) => {
      if (
        onMoveFileDrop &&
        canMoveFileToParentFolder(scopedFilePath, parentRelativePath)
      ) {
        onMoveFileDrop(scopedFilePath, parentRelativePath);
      }
    },
  });

  return (
    <div
      {...dropTargetProps}
      className={
        isDragOver
          ? cn(
              "rounded-xl",
              "ring-2 ring-highlight-300 dark:ring-highlight-300-night"
            )
          : undefined
      }
    >
      {children}
    </div>
  );
}

export interface FileExplorerBreadcrumbProps {
  currentFolderPath: string;
  onNavigate: (index: number) => void;
  onMoveFileDrop?: (scopedFilePath: string, parentRelativePath: string) => void;
}

export function FileExplorerBreadcrumb({
  currentFolderPath,
  onNavigate,
  onMoveFileDrop,
}: FileExplorerBreadcrumbProps) {
  const isDragging = useIsFileExplorerDragging();
  const segments = getFolderBreadcrumbSegments(currentFolderPath);
  const allItems = [
    { label: ROOT_FOLDER_LABEL, path: "" },
    ...segments.map((s) => ({ label: s.label, path: s.path })),
  ];

  return (
    <div className="flex items-center gap-2">
      {currentFolderPath !== "" && isDragging && (
        <span className="animate-in fade-in slide-in-from-left-1 duration-150 text-sm font-medium leading-5 text-foreground dark:text-foreground-night">
          Move to…
        </span>
      )}
      <Breadcrumb>
        {allItems.map((item, index) => {
          const isLast = index === allItems.length - 1;
          return (
            <BreadcrumbItem key={item.path}>
              <BreadcrumbDropZone
                disabled={!isDragging || isLast || !onMoveFileDrop}
                parentRelativePath={item.path}
                onMoveFileDrop={onMoveFileDrop}
              >
                {isLast ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbButton
                    label={item.label}
                    variant="outline"
                    onClick={() => onNavigate(index - 1)}
                  />
                )}
              </BreadcrumbDropZone>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className="select-none px-0.5 text-sm text-muted-foreground dark:text-muted-foreground-night"
                >
                  /
                </span>
              )}
            </BreadcrumbItem>
          );
        })}
      </Breadcrumb>
    </div>
  );
}
