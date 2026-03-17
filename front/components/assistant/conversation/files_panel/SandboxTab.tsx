import { buildSandboxTree } from "@app/components/assistant/conversation/files_panel/utils";
import { useConversationSandboxFiles } from "@app/hooks/conversations/useConversationSandboxFiles";
import type { LightWorkspaceType } from "@app/types/user";
import {
  DocumentIcon,
  FolderIcon,
  ImageIcon,
  ScrollArea,
  Spinner,
  Tree,
} from "@dust-tt/sparkle";
import { useCallback, useMemo } from "react";

import type { SandboxTreeNode } from "./types";

interface SandboxTabProps {
  conversationId: string;
  disabled?: boolean;
  owner: LightWorkspaceType;
  onFileClick: (node: SandboxTreeNode) => void;
}

export function SandboxTab({
  conversationId,
  disabled,
  owner,
  onFileClick,
}: SandboxTabProps) {
  const { sandboxFiles, isSandboxFilesLoading } = useConversationSandboxFiles({
    conversationId,
    owner,
    options: { disabled },
  });

  const sandboxTree = useMemo(
    () => buildSandboxTree(sandboxFiles),
    [sandboxFiles]
  );

  const renderTreeNodes = useCallback(
    (nodes: SandboxTreeNode[]) => {
      return nodes.map((node) => {
        if (node.children.length > 0) {
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
            onItemClick={node.fileId ? () => onFileClick(node) : undefined}
          />
        );
      });
    },
    [onFileClick]
  );

  return (
    <ScrollArea className="flex-1 p-4">
      {isSandboxFilesLoading ? (
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
