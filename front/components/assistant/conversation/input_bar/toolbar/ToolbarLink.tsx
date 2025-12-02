import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  LinkMIcon,
} from "@dust-tt/sparkle";
import type { EditorState } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { useState } from "react";

import { ToolbarIcon } from "@app/components/assistant/conversation/input_bar/toolbar/ToolbarIcon";

interface ToolbarLinkProps {
  editor: Editor;
}

const getLinkPosition = (
  state: EditorState,
  from: number,
  to: number,
  href: string
): { linkStart: number; linkEnd: number } => {
  const linkMarkType = state.schema.marks.link;

  // Start with the current cursor position
  let linkStart = from;
  let linkEnd = to || from;

  // Look backwards for the start of the link
  for (let pos = linkStart; pos >= 0; pos--) {
    const $testPos = state.doc.resolve(pos);
    const marks = $testPos.marks();
    const hasMatchingLink = marks.some(
      (mark) => mark.type === linkMarkType && mark.attrs.href === href
    );
    if (hasMatchingLink) {
      linkStart = pos - 1;
    } else {
      break;
    }
  }

  // Look forwards for the end of the link
  for (let pos = linkEnd; pos <= state.doc.content.size; pos++) {
    const $testPos = state.doc.resolve(pos);
    const marks = $testPos.marks();
    const hasMatchingLink = marks.some(
      (mark) => mark.type === linkMarkType && mark.attrs.href === href
    );
    if (hasMatchingLink) {
      linkEnd = pos;
    } else {
      break;
    }
  }

  return { linkStart, linkEnd };
};

export function ToolbarLink({ editor }: ToolbarLinkProps) {
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkPos, setLinkPos] = useState({ from: 0, to: 0 });

  const handleLinkDialogOpen = () => {
    const { state } = editor;
    const { from, to } = state.selection;
    // Check if we're inside a link
    const linkMark = editor.getAttributes("link");

    if (linkMark.href) {
      // We're inside or on a link, need to find the full link range
      const { linkStart, linkEnd } = getLinkPosition(
        state,
        from,
        to,
        linkMark.href
      );

      const fullLinkText = state.doc.textBetween(linkStart, linkEnd);
      setLinkUrl(linkMark.href);
      setLinkText(fullLinkText);
      setLinkPos({ from: linkStart, to: linkEnd });
    } else {
      // No link, just use selected text
      const selectedText = state.doc.textBetween(from, to);
      setLinkUrl("");
      setLinkText(selectedText);
      setLinkPos({ from, to });
    }
    setIsLinkDialogOpen(true);
  };

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
      .run();

    setLinkText("");
    setLinkUrl("");
    setIsLinkDialogOpen(false);
  };

  return (
    <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
      <ToolbarIcon
        icon={LinkMIcon}
        onClick={handleLinkDialogOpen}
        active={editor.isActive("link")}
        tooltip="Link"
      />
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Insert Link</DialogTitle>
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
            onChange={(e) => setLinkUrl(e.target.value)}
          />
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: () => setIsLinkDialogOpen(false),
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
