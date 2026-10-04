import { cn } from "@dust-tt/sparkle";
// oxlint-disable-next-line no-restricted-imports -- this wrapper is the single sanctioned import site.
import { EditorContent as TiptapEditorContent } from "@tiptap/react";
import type { ComponentProps } from "react";

interface EditorContentProps
  extends ComponentProps<typeof TiptapEditorContent> {}

/**
 * @cc [owner:avervaet,label:security] session-replay-masked
 * The rendered editor MUST carry the `dd-privacy-mask` class, whatever
 * `className` the caller passes. Editors are contenteditable, not form
 * inputs, so session replay records their text unless explicitly masked.
 */
export function EditorContent({ className, ...props }: EditorContentProps) {
  return (
    <TiptapEditorContent
      {...props}
      className={cn("dd-privacy-mask", className)}
    />
  );
}
