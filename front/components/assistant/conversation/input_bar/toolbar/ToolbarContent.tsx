import { useKeyboardShortcutLabel } from "@app/hooks/useKeyboardShortcutLabel";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import {
  Bold01,
  CheckDone01,
  Code01,
  CodeSquare01,
  DoubleQuotes,
  Heading01,
  Italic01,
  List,
  ToolbarContent,
  ToolbarIcon,
  ToolbarLink,
} from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";

interface ToolBarContentProps {
  editor: Editor;
  onOpenLinkDialog: () => void;
}

export function ToolBarContent({
  editor,
  onOpenLinkDialog,
}: ToolBarContentProps) {
  const isMobile = useIsMobile();
  const buttonSize = isMobile ? "xs" : "sm";
  const headingShortcutLabel = useKeyboardShortcutLabel("Mod+Alt+1");
  const boldShortcutLabel = useKeyboardShortcutLabel("Mod+B");
  const italicShortcutLabel = useKeyboardShortcutLabel("Mod+I");
  const linkShortcutLabel = useKeyboardShortcutLabel("Mod+Shift+U");
  const bulletListShortcutLabel = useKeyboardShortcutLabel("Mod+Shift+8");
  const orderedListShortcutLabel = useKeyboardShortcutLabel("Mod+Shift+7");
  const blockquoteShortcutLabel = useKeyboardShortcutLabel("Mod+Shift+9");
  const inlineCodeShortcutLabel = useKeyboardShortcutLabel("Mod+E");
  const codeBlockShortcutLabel = useKeyboardShortcutLabel("Mod+Alt+C");

  function getTooltipText(label: string, shortcutLabel: string): string {
    if (isMobile) {
      return "";
    }
    if (shortcutLabel) {
      return `${label} (${shortcutLabel})`;
    }
    return label;
  }

  const groups = [
    {
      id: "text",
      items: [
        <ToolbarIcon
          key="heading"
          icon={Heading01}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          active={editor.isActive("heading")}
          tooltip={getTooltipText("Heading", headingShortcutLabel)}
          size={buttonSize}
        />,
        <ToolbarIcon
          key="bold"
          icon={Bold01}
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          tooltip={getTooltipText("Bold", boldShortcutLabel)}
          size={buttonSize}
        />,
        <ToolbarIcon
          key="italic"
          icon={Italic01}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          tooltip={getTooltipText("Italic", italicShortcutLabel)}
          size={buttonSize}
        />,
      ],
    },
    {
      id: "link",
      items: [
        <ToolbarLink
          key="link"
          onClick={onOpenLinkDialog}
          active={editor.isActive("link")}
          tooltip={getTooltipText("Link", linkShortcutLabel)}
          size={buttonSize}
        />,
      ],
    },
    {
      id: "lists",
      items: [
        <ToolbarIcon
          key="bulleted-list"
          icon={CheckDone01}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          tooltip={getTooltipText("Bulleted list", bulletListShortcutLabel)}
          size={buttonSize}
        />,
        <ToolbarIcon
          key="ordered-list"
          icon={List}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          tooltip={getTooltipText("Ordered list", orderedListShortcutLabel)}
          size={buttonSize}
        />,
        <ToolbarIcon
          key="blockquote"
          icon={DoubleQuotes}
          onClick={() => {
            if (editor.isActive("codeBlock")) {
              editor.chain().focus().toggleCodeBlock().toggleBlockquote().run();
            } else {
              editor.chain().focus().toggleBlockquote().run();
            }
          }}
          active={editor.isActive("blockquote")}
          tooltip={getTooltipText("Blockquote", blockquoteShortcutLabel)}
          size={buttonSize}
        />,
      ],
    },
    {
      id: "code",
      items: [
        <ToolbarIcon
          key="inline-code"
          icon={Code01}
          onClick={() => editor.chain().focus().toggleCode().run()}
          active={editor.isActive("code")}
          tooltip={getTooltipText("Inline code", inlineCodeShortcutLabel)}
          size={buttonSize}
        />,
        <ToolbarIcon
          key="code-block"
          icon={CodeSquare01}
          onClick={() => {
            if (editor.isActive("blockquote")) {
              editor.chain().focus().toggleBlockquote().toggleCodeBlock().run();
            } else {
              editor.chain().focus().toggleCodeBlock().run();
            }
          }}
          active={editor.isActive("codeBlock")}
          tooltip={getTooltipText("Code block", codeBlockShortcutLabel)}
          size={buttonSize}
        />,
      ],
    },
  ];

  return <ToolbarContent groups={groups} />;
}
