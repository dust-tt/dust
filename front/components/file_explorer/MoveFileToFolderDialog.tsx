import type { SandboxTreeNode } from "@app/components/file_explorer/types";
import {
  buildFolderTree,
  formatFolderDestinationLabel,
  getAncestorFolderPaths,
  getParentFolderRelativePath,
  getScopedRelativePath,
} from "@app/components/file_explorer/utils";
import type { GCSMountEntry } from "@app/lib/api/files/gcs_mount/files";
import type { Result } from "@app/types/shared/result";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FolderIcon,
  Tree,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

interface FolderTreeNodeProps {
  currentParentPath: string;
  expandedPaths: Set<string>;
  node: SandboxTreeNode;
  onSelect: (path: string) => void;
  selectedPath: string;
}

function FolderTreeNode({
  currentParentPath,
  expandedPaths,
  node,
  onSelect,
  selectedPath,
}: FolderTreeNodeProps) {
  const hasChildren = node.children.length > 0;
  const isCurrentLocation = node.path === currentParentPath;

  return (
    <Tree.Item
      isNavigatable
      label={isCurrentLocation ? `${node.name} (current location)` : node.name}
      visual={FolderIcon}
      type={hasChildren ? "node" : "leaf"}
      isSelected={selectedPath === node.path}
      onItemClick={() => onSelect(node.path)}
      defaultCollapsed={!expandedPaths.has(node.path)}
    >
      {hasChildren ? (
        <Tree variant="navigator">
          {node.children.map((child) => (
            <FolderTreeNode
              key={child.path}
              currentParentPath={currentParentPath}
              expandedPaths={expandedPaths}
              node={child}
              onSelect={onSelect}
              selectedPath={selectedPath}
            />
          ))}
        </Tree>
      ) : undefined}
    </Tree.Item>
  );
}

export interface MoveFileToFolderDialogProps {
  files: GCSMountEntry[];
  file: { fileName: string; path: string } | null;
  isOpen: boolean;
  onClose: () => void;
  onMove: (parentRelativePath: string) => Promise<Result<void, Error>>;
}

export function MoveFileToFolderDialog({
  files,
  file,
  isOpen,
  onClose,
  onMove,
}: MoveFileToFolderDialogProps) {
  const folderTree = useMemo(() => buildFolderTree(files), [files]);

  const currentParentPath = useMemo(() => {
    if (!file) {
      return "";
    }
    return getParentFolderRelativePath(getScopedRelativePath(file.path));
  }, [file]);

  const [selectedPath, setSelectedPath] = useState(currentParentPath);

  const expandedPaths = useMemo(
    () => getAncestorFolderPaths(currentParentPath),
    [currentParentPath]
  );

  const destinationLabel = useMemo(
    () => formatFolderDestinationLabel(selectedPath, folderTree),
    [folderTree, selectedPath]
  );

  useEffect(() => {
    if (isOpen) {
      setSelectedPath(currentParentPath);
    }
  }, [currentParentPath, isOpen]);

  const handleMove = useCallback(async () => {
    if (!file || selectedPath === currentParentPath) {
      return;
    }

    const result = await onMove(selectedPath);
    if (result.isOk()) {
      onClose();
    }
  }, [currentParentPath, file, onClose, onMove, selectedPath]);

  const canMove = selectedPath !== currentParentPath;
  const hasFolders = folderTree.length > 0;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {file ? `Move "${file.fileName}"` : "Move file"}
          </DialogTitle>
          <DialogDescription>
            Move to: {destinationLabel}
            {selectedPath === currentParentPath ? " (current location)" : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <Tree
            variant="navigator"
            isBoxed
            className="max-h-80 overflow-y-auto"
          >
            <Tree.Item
              isNavigatable
              label={
                currentParentPath === ""
                  ? "All files (current location)"
                  : "All files"
              }
              visual={FolderIcon}
              type={hasFolders ? "node" : "leaf"}
              isSelected={selectedPath === ""}
              onItemClick={() => setSelectedPath("")}
              defaultCollapsed={false}
            >
              {hasFolders ? (
                <Tree variant="navigator">
                  {folderTree.map((node) => (
                    <FolderTreeNode
                      key={node.path}
                      currentParentPath={currentParentPath}
                      expandedPaths={expandedPaths}
                      node={node}
                      onSelect={setSelectedPath}
                      selectedPath={selectedPath}
                    />
                  ))}
                </Tree>
              ) : undefined}
            </Tree.Item>
          </Tree>
        </DialogContainer>
        <DialogFooter
          rightButtonProps={{
            label: "Move here",
            variant: "primary",
            onClick: handleMove,
            disabled: !canMove,
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
