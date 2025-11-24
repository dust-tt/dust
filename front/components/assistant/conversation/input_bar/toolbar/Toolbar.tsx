import {
  BoldIcon,
  cn,
  CodeBlockIcon,
  CodeSlashIcon,
  HeadingIcon,
  ItalicIcon,
  LinkMIcon,
  ListCheckIcon,
  ListOrdered2Icon,
  QuoteTextIcon,
  Separator,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";

import { ToolbarIcon } from "@app/components/assistant/conversation/input_bar/toolbar/ToolbarIcon";

interface ToolbarProps {
  editor: Editor | null;
  className?: string;
  toggleToolbar?: () => void;
}

export function Toolbar({ editor, className, toggleToolbar }: ToolbarProps) {
  if (!editor) {
    return null;
  }
  return (
    <div className={cn("flex flex-col", className)}>
      <div
        className={cn(
          "flex flex-row gap-2 self-end rounded-2xl bg-white px-3 py-2",
          !toggleToolbar && "m-2"
        )}
      >
        {!!toggleToolbar && (
          <ToolbarIcon
            icon={XMarkIcon}
            onClick={toggleToolbar}
            tooltip="Close toolbar"
          />
        )}
        <ToolbarIcon
          icon={HeadingIcon}
          onClick={() => editor.chain().focus().setHeading({ level: 1 }).run()}
          tooltip="Heading"
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
