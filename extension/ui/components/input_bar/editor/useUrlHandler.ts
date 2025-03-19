import { getLocationForDataSourceViewContentNode } from "@app/shared/lib/content_nodes";
import type { URLState } from "@app/ui/components/input_bar/editor/extensions/URLStorageExtension";
import type { DataSourceViewContentNodeType } from "@dust-tt/client";
import type { Editor } from "@tiptap/core";
import { useCallback, useEffect } from "react";

const useUrlHandler = (
  editor: Editor | null,
  selectedNode: DataSourceViewContentNodeType | null
) => {
  const replaceUrl = useCallback(
    (pendingUrl: URLState, node: DataSourceViewContentNodeType) => {
      if (!editor?.commands) {
        // editor is not ready yet
        return;
      }

      try {
        const formattedText = `${node.title} - ${getLocationForDataSourceViewContentNode(node)}`;
        return editor.commands.insertContentAt(
          { from: pendingUrl.from, to: pendingUrl.to },
          formattedText
        );
      } catch (error) {
        console.error("Failed to replace URL:", error);
        return false;
      }
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

    const success = replaceUrl(pendingUrl, selectedNode);
    if (success) {
      pendingUrls.delete(nodeId);
    }
  }, [editor, selectedNode, replaceUrl]);
};

export default useUrlHandler;
