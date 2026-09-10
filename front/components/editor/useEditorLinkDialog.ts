import { calculateLinkTextAndPosition } from "@app/components/assistant/conversation/input_bar/toolbar/helpers";
import {
  isOpenLinkDialogEventFor,
  OPEN_LINK_DIALOG_EVENT,
} from "@app/components/editor/input_bar/LinkExtension";
import type { ToolbarLinkDialogProps } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";

interface LinkPosition {
  from: number;
  to: number;
}

interface EditorLinkDialog {
  openLinkDialog: () => void;
  linkDialogProps: ToolbarLinkDialogProps;
}

function withProtocol(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `https://${url}`;
}

/**
 * @cc [owner:rfrenoy,label:react] dialog-state-outside-toolbar
 * The returned `linkDialogProps` MUST be rendered outside the editor's selection toolbar. The
 * dialog steals focus from the editor when it opens, which hides that toolbar, so state owned by
 * the toolbar would be discarded before the dialog is painted.
 */
export function useEditorLinkDialog(editor: Editor): EditorLinkDialog {
  const [isOpen, setIsOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkPos, setLinkPos] = useState<LinkPosition>({ from: 0, to: 0 });

  const openLinkDialog = useCallback(() => {
    const { linkUrl, linkText, linkPos } = calculateLinkTextAndPosition({
      editor,
    });
    setLinkUrl(linkUrl);
    setLinkText(linkText);
    setLinkPos(linkPos);
    setIsOpen(true);
  }, [editor]);

  useEffect(() => {
    function handleOpenDialog(event: Event): void {
      // Several editors can be mounted at once; only the one the shortcut was pressed in opens
      // its dialog.
      if (!isOpenLinkDialogEventFor(event, editor)) {
        return;
      }
      openLinkDialog();
    }

    window.addEventListener(OPEN_LINK_DIALOG_EVENT, handleOpenDialog);
    return () => {
      window.removeEventListener(OPEN_LINK_DIALOG_EVENT, handleOpenDialog);
    };
  }, [editor, openLinkDialog]);

  const handleSubmit = useCallback(() => {
    editor
      .chain()
      .focus()
      .deleteRange(linkPos)
      .insertContent(
        {
          type: "text",
          text: linkText || linkUrl,
          marks: linkUrl
            ? [{ type: "link", attrs: { href: withProtocol(linkUrl) } }]
            : [],
        },
        { updateSelection: true }
      )
      .insertContent(linkUrl ? " " : "")
      .focus()
      .run();

    setLinkText("");
    setLinkUrl("");
    setIsOpen(false);
  }, [editor, linkPos, linkText, linkUrl]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        editor.chain().focus().run();
      }
      setIsOpen(open);
    },
    [editor]
  );

  return {
    openLinkDialog,
    linkDialogProps: {
      isOpen,
      onOpenChange: handleOpenChange,
      onSubmit: handleSubmit,
      linkText,
      linkUrl,
      onLinkTextChange: setLinkText,
      onLinkUrlChange: setLinkUrl,
    },
  };
}
