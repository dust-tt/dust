import {
  BoldIcon,
  Button,
  cn,
  CodeBlockIcon,
  CodeSlashIcon,
  HeadingIcon,
  ItalicIcon,
  ListCheckIcon,
  ListOrdered2Icon,
  QuoteTextIcon,
  ScrollArea,
  Separator,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";

import { ToolbarIcon } from "@app/components/assistant/conversation/input_bar/toolbar/ToolbarIcon";
import { ToolbarLink } from "@app/components/assistant/conversation/input_bar/toolbar/ToolbarLink";

interface ToolbarProps {
  editor: Editor | null;
  className?: string;
  onClose?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export function Toolbar({ editor, className, onClose }: ToolbarProps) {
  if (!editor) {
    return null;
  }

  const ToolBarContent = <>
    <ToolbarIcon
        icon={HeadingIcon}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading")}
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

      <Separator orientation="vertical" className="my-1" />
      <ToolbarLink editor={editor} />

      <Separator orientation="vertical" className="my-1" />
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
      />

      <Separator orientation="vertical" className="my-1" />
      <ToolbarIcon
        icon={CodeSlashIcon}
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive("code")}
        tooltip="Inline code"
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
      />
  </>

  return (
    <>
      <div className="hidden sm:inline-flex gap-1 border-b border-t border-border bg-background p-1 dark:border-border-night/50 dark:bg-background-night sm:rounded-2xl sm:border sm:border-border/50 sm:shadow-md">
          {ToolBarContent}
      </div>

      <div
      className={cn(
        "sm: hidden duration-700 absolute left-0 top-0 z-10 inline-flex items-center justify-start gap-3 overflow-hidden bg-primary-50 py-1 pl-3 ease-in-out rounded-xl",
        className,
      )}
    >
      <Button
        size="mini"
        variant="outline"
        icon={XMarkIcon}
        onClick={onClose}
      />
      <ScrollArea
        orientation="horizontal"
        className="h-full border-l border-border w-full"
      >
        <div
          id="Scrollable"
          className="flex h-full w-max flex-row items-center gap-3 px-3 overflow-x-scroll"
        >{ToolBarContent}</div>

      </ScrollArea>
    </div>
    </>
  );
}
