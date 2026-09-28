import { getBlockOuterHtml } from "@app/components/shared/utils";
import { DiffBlock } from "@dust-tt/sparkle";
import type { Extensions } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { useMemo } from "react";

interface SuggestionInstructionsDiffBlockProps {
  instructionsHtml: string;
  targetBlockId: string;
  content: string;
  // Must include the instruction suggestion extension, which provides the diff commands.
  extensions: Extensions;
  // Shown in a conversation: the whole diff stays visible and blends into its section.
  isConversational?: boolean;
}

export function SuggestionInstructionsDiffBlock({
  instructionsHtml,
  targetBlockId,
  content,
  extensions,
  isConversational = false,
}: SuggestionInstructionsDiffBlockProps) {
  const blockHtml = useMemo(
    () =>
      instructionsHtml
        ? getBlockOuterHtml(instructionsHtml, targetBlockId)
        : "",
    [instructionsHtml, targetBlockId]
  );

  const editor = useEditor(
    {
      extensions,
      editable: false,
      content: blockHtml,
      immediatelyRender: false,
      onCreate: ({ editor: e }) => {
        if (!content) {
          return;
        }
        e.commands.applySuggestion({
          id: targetBlockId,
          targetBlockId,
          content,
        });
        e.commands.setHighlightedSuggestion(targetBlockId);
      },
    },
    [blockHtml]
  );

  // The diff box's border is not configurable, so it is overridden here.
  return (
    <DiffBlock
      className="[&_.rounded-2xl.border]:border-0"
      isCollapsible={!isConversational}
      variant={isConversational ? "plain" : "default"}
    >
      {editor && <EditorContent editor={editor} />}
    </DiffBlock>
  );
}
