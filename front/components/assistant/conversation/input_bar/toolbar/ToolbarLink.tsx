import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  LinkMIcon,
} from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

import { calculateLinkTextAndPosition } from "@app/components/assistant/conversation/input_bar/toolbar/helpers";
import { ToolbarIcon } from "@app/components/assistant/conversation/input_bar/toolbar/ToolbarIcon";

interface ToolbarLinkProps {
  editor: Editor;
}

export function ToolbarLink({ editor }: ToolbarLinkProps) {
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkPos, setLinkPos] = useState({ from: 0, to: 0 });
  const editorRef = useRef(editor);

  // Keep editor ref up to date
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const openLinkDialog = (editorInstance: Editor) => {
    const { linkUrl, linkText, linkPos } = calculateLinkTextAndPosition({
      editor: editorInstance,
    });
    setLinkUrl(linkUrl);
    setLinkText(linkText);
    setLinkPos(linkPos);
    setIsLinkDialogOpen(true);
  };

  const handleLinkDialogOpen = () => {
    openLinkDialog(editor);
  };

  // Listen for keyboard shortcut event from the editor
  useEffect(() => {
    const handleOpenDialog = (e: Event) => {
      // Prevent other toolbar instances from handling the same event.
      // This is necessary because there are two toolbar components (one for mobile and one for desktop)
      e.stopImmediatePropagation();

      openLinkDialog(editorRef.current);
    };

    window.addEventListener("dust:openLinkDialog", handleOpenDialog);
    return () => {
      window.removeEventListener("dust:openLinkDialog", handleOpenDialog);
    };
  }, []);

  const handleLinkSubmit = () => {
    let finalText = linkText;
    const urlWithProtocol =
      linkUrl.startsWith("http://") || linkUrl.startsWith("https://")
        ? linkUrl
        : `https://${linkUrl}`;

    if (!finalText) {
      // If no text is provided, insert the link URL as the text
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
  };

  const onClose = (open: boolean) => {
    if (!open) {
      editor.chain().focus().run();
    }
    setIsLinkDialogOpen(open);
  };

  return (
    <Dialog open={isLinkDialogOpen} onOpenChange={onClose}>
      <ToolbarIcon
        icon={LinkMIcon}
        onClick={handleLinkDialogOpen}
        active={editor.isActive("link")}
        tooltip="Link"
        shortcut="Mod+K"
      />
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Insert Link</DialogTitle>
          <DialogDescription>
            Add a link to your message with custom text.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <Input
            id="link-text"
            label="Text"
            placeholder="Text"
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
          />
          <Input
            id="link-url"
            label="Link"
            placeholder="Link"
            value={linkUrl}
            autoFocus
            onChange={(e) => setLinkUrl(e.target.value)}
          />
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: () => onClose(false),
          }}
          rightButtonProps={{
            label: "Save",
            variant: "highlight",
            onClick: handleLinkSubmit,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
