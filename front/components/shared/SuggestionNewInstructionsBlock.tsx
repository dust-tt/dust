import type { SuggestionDiffLayout } from "@app/components/shared/SuggestionFieldEditSection";
import { DiffBlock } from "@dust-tt/sparkle";
import type { Extensions } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";

interface SuggestionNewInstructionsBlockProps {
  instructionsHtml: string;
  extensions: Extensions;
  layout?: SuggestionDiffLayout;
}

// Instructions of a creation suggestion: everything is new, so they are shown as plain
// read-only content rather than a diff that would color the whole text.
export function SuggestionNewInstructionsBlock({
  instructionsHtml,
  extensions,
  layout = "boxed",
}: SuggestionNewInstructionsBlockProps) {
  const editor = useEditor(
    {
      extensions,
      editable: false,
      content: instructionsHtml,
      immediatelyRender: false,
    },
    [instructionsHtml]
  );

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">Instructions</span>
      <DiffBlock
        isCollapsible={layout === "boxed"}
        variant={layout === "inline" ? "plain" : "borderless"}
      >
        {editor && <EditorContent editor={editor} />}
      </DiffBlock>
    </div>
  );
}
