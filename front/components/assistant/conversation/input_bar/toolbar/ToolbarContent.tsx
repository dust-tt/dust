import { calculateLinkTextAndPosition } from "@app/components/assistant/conversation/input_bar/toolbar/helpers";
import { useKeyboardShortcutLabel } from "@app/hooks/useKeyboardShortcutLabel";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import {
  BoldIcon,
  CodeBlockIcon,
  CodeSlashIcon,
  HeadingIcon,
  ItalicIcon,
  ListCheckIcon,
  ListOrdered2Icon,
  QuoteTextIcon,
  ToolbarContent,
  ToolbarIcon,
  ToolbarLink,
} from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

interface ToolBarContentProps {
  editor: Editor;
}

interface LinkPosition {
  from: number;
  to: number;
}

export function ToolBarContent({ editor }: ToolBarContentProps) {
  const isMobile = useIsMobile();
  const buttonSize = isMobile ? "xs" : "mini";
  const headingShortcutLabel = useKeyboardShortcutLabel("Mod+Alt+1");
  const boldShortcutLabel = useKeyboardShortcutLabel("Mod+B");
  const italicShortcutLabel = useKeyboardShortcutLabel("Mod+I");
  const linkShortcutLabel = useKeyboardShortcutLabel("Mod+Shift+U");
  const bulletListShortcutLabel = useKeyboardShortcutLabel("Mod+Shift+8");
  const orderedListShortcutLabel = useKeyboardShortcutLabel("Mod+Shift+7");
  const blockquoteShortcutLabel = useKeyboardShortcutLabel("Mod+Shift+9");
  const inlineCodeShortcutLabel = useKeyboardShortcutLabel("Mod+E");
  const codeBlockShortcutLabel = useKeyboardShortcutLabel("Mod+Alt+C");
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkPos, setLinkPos] = useState<LinkPosition>({ from: 0, to: 0 });
  const editorRef = useRef(editor);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  function getTooltipText(label: string, shortcutLabel: string): string {
    if (isMobile) {
      return "";
    }
    if (shortcutLabel) {
      return `${label} (${shortcutLabel})`;
    }
    return label;
  }

  function openLinkDialog(editorInstance: Editor): void {
    const { linkUrl, linkText, linkPos } = calculateLinkTextAndPosition({
      editor: editorInstance,
    });
    setLinkUrl(linkUrl);
    setLinkText(linkText);
    setLinkPos(linkPos);
    setIsLinkDialogOpen(true);
  }

  function handleLinkDialogOpen(): void {
    openLinkDialog(editor);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  useEffect(() => {
    function handleOpenDialog(event: Event): void {
      // Prevent other toolbar instances from handling the same event.
      event.stopImmediatePropagation();

      openLinkDialog(editorRef.current);
    }

    window.addEventListener("dust:openLinkDialog", handleOpenDialog);
    return () => {
      window.removeEventListener("dust:openLinkDialog", handleOpenDialog);
    };
  }, []);

  function handleLinkSubmit(): void {
    let finalText = linkText;
    const urlWithProtocol =
      linkUrl.startsWith("http://") || linkUrl.startsWith("https://")
        ? linkUrl
        : `https://${linkUrl}`;

    if (!finalText) {
      finalText = linkUrl;
    }

    editor
      .chain()
      .focus()
      .deleteRange(linkPos)
      .insertContent(
        {
          type: "text",
          text: finalText,
          marks: linkUrl
            ? [{ type: "link", attrs: { href: urlWithProtocol } }]
            : [],
        },
        { updateSelection: true }
      )
      .insertContent(linkUrl ? " " : "")
      .focus()
      .run();

    setLinkText("");
    setLinkUrl("");
    setIsLinkDialogOpen(false);
  }

  function handleLinkDialogOpenChange(open: boolean): void {
    if (!open) {
      editor.chain().focus().run();
    }
    setIsLinkDialogOpen(open);
  }

  const groups = [
    {
      id: "text",
      items: [
        <ToolbarIcon
          key="heading"
          icon={HeadingIcon}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          active={editor.isActive("heading")}
          tooltip={getTooltipText("Heading", headingShortcutLabel)}
          size={buttonSize}
        />,
        <ToolbarIcon
          key="bold"
          icon={BoldIcon}
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          tooltip={getTooltipText("Bold", boldShortcutLabel)}
          size={buttonSize}
        />,
        <ToolbarIcon
          key="italic"
          icon={ItalicIcon}
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
          isOpen={isLinkDialogOpen}
          onOpenChange={handleLinkDialogOpenChange}
          onOpenDialog={handleLinkDialogOpen}
          onSubmit={handleLinkSubmit}
          linkText={linkText}
          linkUrl={linkUrl}
          onLinkTextChange={setLinkText}
          onLinkUrlChange={setLinkUrl}
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
          icon={ListCheckIcon}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          tooltip={getTooltipText("Bulleted list", bulletListShortcutLabel)}
          size={buttonSize}
        />,
        <ToolbarIcon
          key="ordered-list"
          icon={ListOrdered2Icon}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          tooltip={getTooltipText("Ordered list", orderedListShortcutLabel)}
          size={buttonSize}
        />,
        <ToolbarIcon
          key="blockquote"
          icon={QuoteTextIcon}
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
          icon={CodeSlashIcon}
          onClick={() => editor.chain().focus().toggleCode().run()}
          active={editor.isActive("code")}
          tooltip={getTooltipText("Inline code", inlineCodeShortcutLabel)}
          size={buttonSize}
        />,
        <ToolbarIcon
          key="code-block"
          icon={CodeBlockIcon}
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
