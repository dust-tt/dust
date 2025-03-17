import type { Editor } from "@tiptap/core";
import { useCallback, useEffect } from "react";

import type { DataSourceViewContentNode } from "@app/types";

import type { URLState } from "./extensions/URLStorageExtension";

const useUrlHandler = (
  editor: Editor | null,
  selectedNode: DataSourceViewContentNode | null
) => {
  const replaceUrl = useCallback(
    (pendingUrl: URLState, nodeId: string, spaceId: string) => {
      if (!editor?.commands) {
        // editor is not ready yet
        return;
      }

      try {
        const formattedText = `${nodeId} - ${spaceId}`;
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

    const success = replaceUrl(
      pendingUrl,
      nodeId,
      selectedNode.dataSourceView.spaceId
    );

    if (success) {
      pendingUrls.delete(nodeId);
    }
  }, [editor, selectedNode, replaceUrl]);
};

export default useUrlHandler;
