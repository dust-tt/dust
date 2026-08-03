import { FILE_PREVIEW_NODE_TYPE } from "@app/components/editor/extensions/input_bar/FilePreviewExtension";
import type {
  ContextSlashSearchSelection,
  ContextSlashSearchUseCase,
} from "@app/components/editor/extensions/shared/slash_suggestion/contextSlashSearchTypes";
import { KNOWLEDGE_NODE_TYPE } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import { knowledgeNodeToItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import type { Editor, Range } from "@tiptap/core";

function getContextFileReferenceContent(
  selection: Extract<ContextSlashSearchSelection, { kind: "file" }>["selection"]
) {
  return [
    {
      type: FILE_PREVIEW_NODE_TYPE,
      attrs: {
        contentType: selection.contentType,
        path: selection.path,
        title: selection.label,
      },
    },
    { type: "text" as const, text: " " },
  ];
}

export function applyAttachContextSelection({
  editor,
  onKnowledgeSelect,
  range,
  selection,
  useCase,
}: {
  editor: Editor;
  onKnowledgeSelect?: (node: DataSourceViewContentNode) => void;
  range: Range;
  selection: ContextSlashSearchSelection;
  useCase: ContextSlashSearchUseCase;
}) {
  if (selection.kind === "knowledge") {
    if (useCase === "skill-builder") {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent([
          {
            type: KNOWLEDGE_NODE_TYPE,
            attrs: {
              selectedItems: [knowledgeNodeToItem(selection.node)],
            },
          },
          { type: "text", text: " " },
        ])
        .run();
      return;
    }

    editor.chain().focus().deleteRange(range).run();
    onKnowledgeSelect?.(selection.node);
    queueMicrotask(() => {
      if (!editor.isDestroyed) {
        editor.chain().focus().run();
      }
    });
    return;
  }

  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent(getContextFileReferenceContent(selection.selection))
    .run();
}
