import type { FileSystemTreeNode } from "@app/components/file_explorer/types";
import {
  formatFolderDestinationLabel,
  getAncestorFolderPaths,
  getParentFolderRelativePath,
  getScopedRelativePath,
  ROOT_FOLDER_LABEL,
} from "@app/components/file_explorer/utils";
import type { Result } from "@app/types/shared/result";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Folder,
  Tree,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useMemo, useState } from "react";

interface FolderTreeNodeProps {
  currentParentPath: string;
  expandedPaths: Set<string>;
  node: FileSystemTreeNode;
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
  const { t } = useLingui();
  const nodeName = node.name;
  const hasChildren = node.children.length > 0;
  const isCurrentLocation = node.path === currentParentPath;

  return (
    <Tree.Item
      isNavigatable
      label={isCurrentLocation ? t`${nodeName} (current location)` : nodeName}
      visual={Folder}
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

interface MoveFileToFolderDialogProps {
  folderTree: FileSystemTreeNode[];
  file: { fileName: string; path: string } | null;
  isOpen: boolean;
  onClose: () => void;
  onMove: (parentRelativePath: string) => Promise<Result<void, Error>>;
}

export function MoveFileToFolderDialog({
  folderTree,
  file,
  isOpen,
  onClose,
  onMove,
}: MoveFileToFolderDialogProps) {
  const { t } = useLingui();
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
    () => formatFolderDestinationLabel(selectedPath, folderTree, t),
    [folderTree, selectedPath, t]
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
  const fileName = file?.fileName;
  const rootFolderLabel = t(ROOT_FOLDER_LABEL);

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
            {fileName !== undefined ? t`Move "${fileName}"` : t`Move file`}
          </DialogTitle>
          <DialogDescription>
            {selectedPath === currentParentPath ? (
              <Trans>Move to: {destinationLabel} (current location)</Trans>
            ) : (
              <Trans>Move to: {destinationLabel}</Trans>
            )}
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
                  ? t`${rootFolderLabel} (current location)`
                  : rootFolderLabel
              }
              visual={Folder}
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
            label: t`Move here`,
            variant: "primary",
            onClick: handleMove,
            disabled: !canMove,
          }}
          leftButtonProps={{
            label: t`Cancel`,
            variant: "outline",
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
