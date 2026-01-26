import { ToolbarLink as SparkleToolbarLink } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

import { calculateLinkTextAndPosition } from "@app/components/assistant/conversation/input_bar/toolbar/helpers";
import { useKeyboardShortcutLabel } from "@app/hooks/useKeyboardShortcutLabel";
import { useIsMobile } from "@app/lib/swr/useIsMobile";

interface ToolbarLinkProps {
  editor: Editor;
}

interface LinkPosition {
  from: number;
  to: number;
}

/** @deprecated Use @dust-tt/sparkle ToolbarLink with explicit state props. */
export function ToolbarLink({ editor }: ToolbarLinkProps) {
  const isMobile = useIsMobile();
  const buttonSize = isMobile ? "xs" : "mini";
  const linkShortcutLabel = useKeyboardShortcutLabel("Mod+K");
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

  return (
    <SparkleToolbarLink
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
    />
  );
}
