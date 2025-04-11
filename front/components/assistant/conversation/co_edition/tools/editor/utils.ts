import type { Editor } from "@tiptap/react";

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

export function insertNodes(
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

      chain()
        .setMark("agentContent")
        .insertContentAt(insertPos, params.content)
        .unsetMark("agentContent")
        .run();

      return true;
    })
    .run();
}
