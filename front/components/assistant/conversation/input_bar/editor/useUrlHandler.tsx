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
      const { doc } = editor.state;
      const pos = pendingUrl.from;

      // Check if we need to add a space before the node
      // (if not at start of document/paragraph and previous char isn't a space)
      let needsLeadingSpace = false;
      if (pos > 0) {
        const $pos = doc.resolve(pos);
        const textBefore = doc.textBetween($pos.start(), pos, " ");
        const lastChar =
          textBefore.length > 0 ? textBefore[textBefore.length - 1] : "";
        needsLeadingSpace =
          lastChar !== "" && lastChar !== " " && lastChar !== "\n";
      }

      // Create a transaction that replaces the URL and adds spaces as needed
      editor
        .chain()
        .focus()
        .deleteRange({ from: pendingUrl.from, to: pendingUrl.to })
        .insertContent(needsLeadingSpace ? " " : "")
        .insertContent({
          type: "dataSourceLink",
          attrs: {
            nodeId,
            title: selectedNode.title,
            provider: selectedNode.dataSourceView.dataSource.connectorProvider,
            spaceId: selectedNode.dataSourceView.spaceId,
          },
        })
        .insertContent(" ")
        .run();

      // Remove from pending URLs
      storage.pendingUrls.delete(nodeId);
    }
  }, [editor, selectedNode]);
};

export default useUrlHandler;
