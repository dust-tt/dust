import {
  BoldIcon,
  CodeBlockIcon,
  CodeSlashIcon,
  HeadingIcon,
  ItalicIcon,
  ListCheckIcon,
  ListOrdered2Icon,
  QuoteTextIcon,
  Separator,
} from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";

import { ToolbarIcon } from "@app/components/assistant/conversation/input_bar/toolbar/ToolbarIcon";
import { ToolbarLink } from "@app/components/assistant/conversation/input_bar/toolbar/ToolbarLink";

export function ToolBarContent({ editor }: { editor: Editor }) {
  return (
    <>
      <ToolbarIcon
        icon={HeadingIcon}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading")}
        tooltip="Heading"
        shortcut="Mod+Alt+1"
      />
      <ToolbarIcon
        icon={BoldIcon}
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        tooltip="Bold"
        shortcut="Mod+B"
      />
      <ToolbarIcon
        icon={ItalicIcon}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        tooltip="Italic"
        shortcut="Mod+I"
      />

      <Separator orientation="vertical" className="my-1" />
      <ToolbarLink editor={editor} />

      <Separator orientation="vertical" className="my-1" />
      <ToolbarIcon
        icon={ListCheckIcon}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        tooltip="Bulleted list"
        shortcut="Mod+Shift+8"
      />
      <ToolbarIcon
        icon={ListOrdered2Icon}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        tooltip="Ordered list"
        shortcut="Mod+Shift+7"
      />
      <ToolbarIcon
        icon={QuoteTextIcon}
        onClick={() => {
          // If code block is active, turn it off first
          if (editor.isActive("codeBlock")) {
            editor.chain().focus().toggleCodeBlock().toggleBlockquote().run();
          } else {
            editor.chain().focus().toggleBlockquote().run();
          }
        }}
        active={editor.isActive("blockquote")}
        tooltip="Blockquote"
        shortcut="Mod+Shift+9"
      />

      <Separator orientation="vertical" className="my-1" />
      <ToolbarIcon
        icon={CodeSlashIcon}
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive("code")}
        tooltip="Inline code"
        shortcut="Mod+E"
      />
      <ToolbarIcon
        icon={CodeBlockIcon}
        onClick={() => {
          // If blockquote is active, turn it off first
          if (editor.isActive("blockquote")) {
            editor.chain().focus().toggleBlockquote().toggleCodeBlock().run();
          } else {
            editor.chain().focus().toggleCodeBlock().run();
          }
        }}
        active={editor.isActive("codeBlock")}
        tooltip="Code block"
        shortcut="Mod+Alt+C"
      />
    </>
  );
}
