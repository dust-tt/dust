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
      // Create a data source link node
      editor.commands.insertContentAt(
        { from: pendingUrl.from, to: pendingUrl.to },
        {
          type: "dataSourceLink",
          attrs: {
            nodeId: nodeId,
            title: selectedNode.title,
            provider: selectedNode.dataSourceView.dataSource.connectorProvider,
            spaceId: selectedNode.dataSourceView.spaceId,
          },
        }
      );

      // Remove from pending URLs
      storage.pendingUrls.delete(nodeId);
    }
  }, [editor, selectedNode]);
};

export default useUrlHandler;
