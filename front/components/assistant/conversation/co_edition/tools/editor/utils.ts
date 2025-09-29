import type { Editor } from "@tiptap/react";

import { imageContentToNode } from "@app/components/assistant/conversation/co_edition/extensions/FileImageExtension";
import type { CoEditionContent } from "@app/components/assistant/conversation/co_edition/tools/editor/types";

// Simple utility function that works with all nodes.
export function getDocumentPositions(doc: any) {
  // Just get all top-level nodes and their positions.
  const positions: { node: any; pos: number; index: number }[] = [];
  let index = 0;

  doc.forEach((node: any, offset: number) => {
    positions.push({ node, pos: offset, index: index++ });
  });

  return positions;
}

export function contentToHtml(content: CoEditionContent) {
  if (content.type === "text") {
    return content.content;
  } else {
    return imageContentToNode(content);
  }
}

function insertNode(
  editor: Editor,
  params: { position: number; content: string }
) {
  return editor
    .chain()
    .focus()
    .command(({ tr, chain }) => {
      const positions = getDocumentPositions(tr.doc);
      const targetPosition = positions[params.position];
      const insertPos = targetPosition
        ? targetPosition.pos
        : tr.doc.content.size;

      chain().insertContentAt(insertPos, params.content).run();

      return true;
    })
    .run();
}

// Best-effort implementation of inserting multiple nodes. Order might be broken with custom node types.
function insertNodes(editor: Editor, nodes: Array<CoEditionContent>) {
  return editor
    .chain()
    .focus()
    .command(({ tr, commands }) => {
      let pos = tr.selection.from;

      nodes.forEach((node) => {
        commands.insertContentAt(pos, contentToHtml(node));

        // Update position for next insertion.
        pos = tr.selection.from;
      });
      return true;
    })
    .run();
}
