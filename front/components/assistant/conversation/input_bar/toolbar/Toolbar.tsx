import {
  BoldIcon,
  CodeBlockIcon,
  CodeSlashIcon,
  FontSizeAiIcon,
  ItalicIcon,
  LinkMIcon,
  ListCheckIcon,
  ListOrdered2Icon,
  QuoteTextIcon,
  Separator,
} from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";

import { ToolbarIcon } from "@app/components/assistant/conversation/input_bar/toolbar/ToolbarIcon";

export function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) {
    return null;
  }
  return (
    <div className="flex flex-col">
      <div className="m-2 flex flex-row gap-2 self-end rounded-2xl bg-white px-3 py-2">
        <ToolbarIcon
          icon={FontSizeAiIcon}
          onClick={() => editor.chain().focus().clearNodes().run()}
          tooltip="Clear formatting"
        />
        <ToolbarIcon
          icon={BoldIcon}
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          tooltip="Bold"
        />
        <ToolbarIcon
          icon={ItalicIcon}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          tooltip="Italic"
        />

        <Separator orientation="vertical" />
        <ToolbarIcon
          icon={LinkMIcon}
          onClick={() =>
            editor
              .chain()
              .focus()
              .toggleLink({ href: "https://www.google.com" })
              .run()
          }
          active={editor.isActive("link")}
          tooltip="Link"
        />

        <Separator orientation="vertical" />
        <ToolbarIcon
          icon={ListCheckIcon}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          tooltip="Bulleted list"
        />
        <ToolbarIcon
          icon={ListOrdered2Icon}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          tooltip="Ordered list"
        />
        <ToolbarIcon
          icon={QuoteTextIcon}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          tooltip="Blockquote"
        />

        <Separator orientation="vertical" />
        <ToolbarIcon
          icon={CodeSlashIcon}
          onClick={() => editor.chain().focus().toggleCode().run()}
          active={editor.isActive("code")}
          tooltip="Inline code"
        />
        <ToolbarIcon
          icon={CodeBlockIcon}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive("codeBlock")}
          tooltip="Code block"
        />
      </div>
    </div>
  );
}
