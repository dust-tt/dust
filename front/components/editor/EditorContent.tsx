import { cn } from "@dust-tt/sparkle";
// biome-ignore lint/style/noRestrictedImports: this wrapper is the single sanctioned import site.
import { EditorContent as TiptapEditorContent } from "@tiptap/react";
import type { ComponentProps } from "react";

/**
 * @cc label:security
 * Every rich-text editor is rendered through this component. Editors are
 * contenteditable elements, not form controls, so session-replay tooling
 * that masks "user input" records their text verbatim unless an explicit
 * mask is present. The mask is applied here so every current and future
 * placement is covered without per-page wiring.
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
