import type { Editor } from "@tiptap/core";
import { useEffect } from "react";

import type { DataSourceViewContentNode } from "@app/types";

const useUrlHandler = (
  editor: Editor | null,
  selectedNode: DataSourceViewContentNode | null
) => {
  useEffect(() => {
    if (!selectedNode || !editor) {
      return;
    }

    const storage = editor.storage.URLStorage;
    const nodeId = selectedNode.internalId;
    const pendingUrl = storage.pendingUrls.get(nodeId);

    if (pendingUrl) {
      // Replace URL with formatted text
      const formattedText = `${nodeId} - ${selectedNode.dataSourceView.spaceId}`;
      editor.commands.insertContentAt(
        { from: pendingUrl.from, to: pendingUrl.to },
        formattedText
      );

      // Remove from pending URLs
      storage.pendingUrls.delete(nodeId);
    }
  }, [editor, selectedNode]);
};

export default useUrlHandler;
