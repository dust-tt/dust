import {
  Bold01,
  Button,
  Check,
  CheckDone01,
  CodeSquare01,
  Heading01,
  Italic01,
  List,
  Separator,
  TagBlock,
  XClose,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";

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
  const { t } = useLingui();

  if (!editor) {
    return null;
  }

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2 px-3 py-2">
      <Button
        icon={Heading01}
        size="icon"
        variant="ghost-secondary"
        tooltip={t`Heading`}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <Button
        icon={Bold01}
        size="icon"
        variant="ghost-secondary"
        tooltip={t`Bold`}
        tooltipShortcut="Cmd+B"
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <Button
        icon={Italic01}
        size="icon"
        variant="ghost-secondary"
        tooltip={t`Italic`}
        tooltipShortcut="Cmd+I"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <Separator orientation="vertical" />
      <Button
        icon={CheckDone01}
        size="icon"
        variant="ghost-secondary"
        tooltip={t`Bulleted list`}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <Button
        icon={List}
        size="icon"
        variant="ghost-secondary"
        tooltip={t`Ordered list`}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <Separator orientation="vertical" />
      <Button
        icon={CodeSquare01}
        size="icon"
        variant="ghost-secondary"
        tooltip={t`Code block`}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <Separator orientation="vertical" />
      <Button
        icon={TagBlock}
        size="icon"
        variant="ghost-secondary"
        tooltip={t`XML tag`}
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
            icon={XClose}
            label={t`Reject all`}
            tooltip={t`Reject all suggestions`}
            onClick={onRejectAll}
          />
          <Button
            size="xs"
            icon={Check}
            variant="highlight-secondary"
            label={t`Accept all`}
            tooltip={t`Accept all suggestions`}
            onClick={onAcceptAll}
          />
        </div>
      )}
    </div>
  );
}
