import type { Editor } from "@tiptap/core";
import { useCallback, useEffect } from "react";

import type { DataSourceViewContentNode } from "@app/types";

import type { URLState } from "./extensions/URLStorageExtension";

const useUrlHandler = (
  editor: Editor | null,
  selectedNode: DataSourceViewContentNode | null
) => {
  const replaceUrl = useCallback(
    async (pendingUrl: URLState, node: DataSourceViewContentNode) => {
      if (!editor?.commands) {
        return false;
      }

      // Defer the command execution to avoid React flush issues
      // React doesn't allow state updates while it's still rendering components
      // We defer the execution using a microtask
      return new Promise<boolean>((resolve) => {
        setTimeout(() => {
          if (!editor?.commands) {
            resolve(false);
            return;
          }

          const { doc } = editor.state;

          // Check if we need to add a space before the node
          let needsLeadingSpace = false;
          if (pendingUrl.from > 0) {
            const $pos = doc.resolve(pendingUrl.from);
            const textBefore = doc.textBetween(
              $pos.start(),
              pendingUrl.from,
              " "
            );
            needsLeadingSpace = !!textBefore && !/\s$/.test(textBefore);
          }

          // Create the replacement content
          const content = [
            ...(needsLeadingSpace ? [{ type: "text", text: " " }] : []),
            {
              type: "dataSourceLink",
              attrs: {
                nodeId: node.internalId,
                title: node.title,
                provider: node.dataSourceView.dataSource.connectorProvider,
                spaceId: node.dataSourceView.spaceId,
                url: pendingUrl.url,
              },
              text: `:content_node_mention[${node.title}]{url=${pendingUrl.url}}`,
            },
            { type: "text", text: " " },
          ];

          try {
            const success = editor.commands.insertContentAt(
              { from: pendingUrl.from, to: pendingUrl.to },
              content
            );
            resolve(success);
          } catch (error) {
            console.error("Failed to replace URL:", error);
            resolve(false);
          }
        }, 0);
      });
    },
    [editor]
  );

  useEffect(() => {
    if (!selectedNode?.internalId || !editor?.storage.URLStorage) {
      return;
    }

    const { pendingUrls } = editor.storage.URLStorage;
    const nodeId = selectedNode.internalId;
    const pendingUrl = pendingUrls.get(nodeId);

    if (!pendingUrl) {
      return;
    }

    // Immediately remove from pending to prevent duplicates
    const urlState = { ...pendingUrl };
    pendingUrls.delete(nodeId);

    void replaceUrl(urlState, selectedNode);
  }, [editor, selectedNode, replaceUrl]);
};

export default useUrlHandler;
