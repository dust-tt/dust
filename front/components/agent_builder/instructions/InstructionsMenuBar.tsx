import {
  BoldIcon,
  Button,
  CheckIcon,
  CodeBlockIcon,
  HeadingIcon,
  ItalicIcon,
  ListCheckIcon,
  ListOrdered2Icon,
  Separator,
  TagBlockIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React from "react";

interface InstructionsMenuBarProps {
  editor: Editor | null;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  showSuggestionActions?: boolean;
  toolbarExtra?: ReactNode;
}

export function InstructionsMenuBar({
  editor,
  onAcceptAll,
  onRejectAll,
  showSuggestionActions = false,
  toolbarExtra,
}: InstructionsMenuBarProps) {
  if (!editor) {
    return null;
  }

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2 px-3 py-2">
      <Button
        icon={HeadingIcon}
        size="icon"
        variant="ghost-secondary"
        tooltip="Heading"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <Button
        icon={BoldIcon}
        size="icon"
        variant="ghost-secondary"
        tooltip="Bold"
        tooltipShortcut="Cmd+B"
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <Button
        icon={ItalicIcon}
        size="icon"
        variant="ghost-secondary"
        tooltip="Italic"
        tooltipShortcut="Cmd+I"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <Separator orientation="vertical" />
      <Button
        icon={ListCheckIcon}
        size="icon"
        variant="ghost-secondary"
        tooltip="Bulleted list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <Button
        icon={ListOrdered2Icon}
        size="icon"
        variant="ghost-secondary"
        tooltip="Ordered list"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <Separator orientation="vertical" />
      <Button
        icon={CodeBlockIcon}
        size="icon"
        variant="ghost-secondary"
        tooltip="Code Block"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <Separator orientation="vertical" />
      <Button
        icon={TagBlockIcon}
        size="icon"
        variant="ghost-secondary"
        tooltip="XML tag"
        onClick={() => editor.chain().focus().insertInstructionBlock().run()}
      />
      <Separator orientation="vertical" />
      {toolbarExtra}
      <div className="flex-1" />
      {showSuggestionActions && (
        <div className="ml-auto flex gap-2">
          <Button
            size="xs"
            variant="outline"
            icon={XMarkIcon}
            label="Reject all"
            tooltip="Reject all suggestions"
            onClick={onRejectAll}
          />
          <Button
            size="xs"
            icon={CheckIcon}
            variant="highlight-secondary"
            label="Accept all"
            tooltip="Accept all suggestions"
            onClick={onAcceptAll}
          />
        </div>
      )}
    </div>
  );
}
