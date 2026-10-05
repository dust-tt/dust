import { cn } from "@dust-tt/sparkle";
// biome-ignore lint/style/noRestrictedImports: this wrapper is the single sanctioned import site.
import { EditorContent as TiptapEditorContent } from "@tiptap/react";
import type { ComponentProps } from "react";

/**
 * @cc label:security
 * Every rich-text editor renders through this component. Editors are
 * contenteditable, not form inputs, so session replay records their text
 * unless explicitly masked.
 */
export function EditorContent({
  className,
  ...props
}: ComponentProps<typeof TiptapEditorContent>) {
  return (
    <TiptapEditorContent
      {...props}
      className={cn("dd-privacy-mask", className)}
    />
  );
}
