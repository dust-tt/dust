import type { NodeCandidate, UrlCandidate } from "@app/lib/connectors";
import { isUrlCandidate } from "@app/lib/connectors";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import type { Editor } from "@tiptap/core";
import { useCallback, useEffect } from "react";

import type { URLState } from "../extensions/input_bar/URLStorageExtension";

// `insertContentAt` defaults to `updateSelection: true`, which drops the caret
// right after the inserted node. When the user had already typed past the
// pasted URL (caret at or after the replaced range), that places the caret
// before their typed text and scrambles subsequent input. Re-map the caret by
// the document size delta so it stays at the user's logical typing position.
// When the caret was inside/before the URL we leave the default untouched.
export function remapCaretAfterUrlReplacement(
  editor: Editor,
  {
    savedCursor,
    oldDocSize,
    replacedTo,
  }: { savedCursor: number; oldDocSize: number; replacedTo: number }
): void {
  if (savedCursor < replacedTo) {
    return;
  }

  const delta = editor.state.doc.content.size - oldDocSize;
  // Clamp to the last selectable position: `content.size - 1` excludes the
  // paragraph's closing token, which is not a valid caret position.
  const newPos = Math.min(
    savedCursor + delta,
    editor.state.doc.content.size - 1
  );
  editor.commands.setTextSelection(newPos);
}

const useUrlHandler = (
  editor: Editor | null,
  selectedNode: DataSourceViewContentNode | null,
  candidate: UrlCandidate | NodeCandidate | null,
  onUrlReplaced: () => void
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

          // Capture the caret and document size before the insertion so we
          // can restore the user's logical typing position afterwards.
          const { from: savedCursor } = editor.state.selection;
          const oldDocSize = doc.content.size;

          try {
            const success = editor.commands.insertContentAt(
              { from: pendingUrl.from, to: pendingUrl.to },
              content
            );

            if (success) {
              remapCaretAfterUrlReplacement(editor, {
                savedCursor,
                oldDocSize,
                replacedTo: pendingUrl.to,
              });
            }

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
    const nodeId = isUrlCandidate(candidate)
      ? selectedNode.sourceUrl
      : selectedNode.internalId;

    if (!nodeId) {
      return;
    }

    const pendingUrl = pendingUrls.get(nodeId);

    if (!pendingUrl) {
      return;
    }

    // Immediately remove from pending to prevent duplicates
    const urlState = { ...pendingUrl };
    pendingUrls.delete(nodeId);

    void replaceUrl(urlState, selectedNode).then(() => {
      onUrlReplaced();
    });
  }, [editor, selectedNode, replaceUrl, candidate, onUrlReplaced]);
};

export default useUrlHandler;
