import {
  DocumentIcon,
  FolderIcon,
  ImageIcon,
  ScrollArea,
  Spinner,
  Tree,
} from "@dust-tt/sparkle";
import { useCallback } from "react";

import type { SandboxTreeNode } from "./types";

interface SandboxTabProps {
  isLoading: boolean;
  sandboxTree: SandboxTreeNode[];
  onFileClick: (fileId: string, name: string, contentType: string) => void;
}

export function SandboxTab({
  isLoading,
  sandboxTree,
  onFileClick,
}: SandboxTabProps) {
  const renderTreeNodes = useCallback(
    (nodes: SandboxTreeNode[]) => {
      return nodes.map((node) => {
        if (node.isDirectory) {
          return (
            <Tree.Item
              key={node.path}
              label={node.name}
              type="node"
              visual={FolderIcon}
              defaultCollapsed={false}
            >
              {renderTreeNodes(node.children)}
            </Tree.Item>
          );
        }
        const icon = node.contentType.startsWith("image/")
          ? ImageIcon
          : DocumentIcon;
        return (
          <Tree.Item
            key={node.path}
            label={node.name}
            type="leaf"
            visual={icon}
            onItemClick={
              node.fileId
                ? () => onFileClick(node.fileId!, node.name, node.contentType)
                : undefined
            }
          />
        );
      });
    },
    [onFileClick]
  );

  return (
    <ScrollArea className="flex-1 p-4">
      {isLoading ? (
        <div className="flex w-full items-center justify-center p-8">
          <Spinner />
        </div>
      ) : sandboxTree.length > 0 ? (
        <Tree>{renderTreeNodes(sandboxTree)}</Tree>
      ) : (
        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          No files in the sandbox yet.
        </div>
      )}
    </ScrollArea>
  );
}
