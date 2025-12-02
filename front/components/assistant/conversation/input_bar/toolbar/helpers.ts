import type { EditorState } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";

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

export const calculateLinkTextAndPosition = ({
  editor,
}: {
  editor: Editor;
}) => {
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
    return {
      linkUrl: linkMark.href,
      linkText: fullLinkText,
      linkPos: { from: linkStart, to: linkEnd },
    };
  } else {
    // No link, just use selected text
    const selectedText = state.doc.textBetween(from, to);
    return {
      linkUrl: "",
      linkText: selectedText,
      linkPos: { from, to },
    };
  }
};
