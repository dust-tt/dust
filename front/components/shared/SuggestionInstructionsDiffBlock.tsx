import { EditorContent } from "@app/components/editor/EditorContent";
import type { SuggestionDiffLayout } from "@app/components/shared/SuggestionFieldEditSection";
import { getBlockOuterHtml } from "@app/components/shared/utils";
import { DiffBlock } from "@dust-tt/sparkle";
import type { Extensions } from "@tiptap/react";
import { useEditor } from "@tiptap/react";
import { useMemo } from "react";

interface SuggestionInstructionsDiffBlockProps {
  instructionsHtml: string;
  targetBlockId: string;
  content: string;
  // Must include the instruction suggestion extension, which provides the diff commands.
  extensions: Extensions;
  layout?: SuggestionDiffLayout;
}

export function SuggestionInstructionsDiffBlock({
  instructionsHtml,
  targetBlockId,
  content,
  extensions,
  layout = "boxed",
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

  return (
    <DiffBlock
      isCollapsible={layout === "boxed"}
      variant={layout === "inline" ? "plain" : "borderless"}
    >
      {editor && <EditorContent editor={editor} />}
    </DiffBlock>
  );
}
