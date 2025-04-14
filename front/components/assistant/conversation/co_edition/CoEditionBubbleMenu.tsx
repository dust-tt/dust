import { Button, cn } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react";

interface CoEditionBubbleMenuProps {
  editor: Editor;
}

export function CoEditionBubbleMenu({ editor }: CoEditionBubbleMenuProps) {
  if (!editor) {
    return null;
  }

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 200 }}
      className={cn(
        "border-2 border-border-dark p-1 dark:border-border-dark-night",
        "rounded-xl bg-background dark:bg-muted-background"
      )}
    >
      <div className="flex flex-row gap-1">
        <Button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive("bold") ? "is-active" : ""}
          label="Bold"
          size="xs"
          variant="ghost"
        />
        <Button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive("italic") ? "is-active" : ""}
          label="Italic"
          size="xs"
          variant="ghost"
        />
        <Button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={editor.isActive("strike") ? "is-active" : ""}
          label="Strike"
          size="xs"
          variant="ghost"
        />
      </div>
    </BubbleMenu>
  );
}
