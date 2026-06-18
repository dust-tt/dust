import { DataSourceLinkExtension } from "@app/components/editor/extensions/input_bar/DataSourceLinkExtension";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";
import { remapCaretAfterUrlReplacement } from "@app/components/editor/input_bar/useUrlHandler";
import type { Editor } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const PASTED_URL = "https://example.com/x";

// Performs the same insertion `useUrlHandler.replaceUrl` does (swap the pasted
// URL range for a `dataSourceLink` node + trailing space) and then delegates
// the caret restoration to the *real* production helper, so these tests guard
// `remapCaretAfterUrlReplacement` rather than a copy of it.
function replaceUrlRange(
  editor: Editor,
  range: { from: number; to: number },
  title: string,
  url: string
): void {
  const content = [
    {
      type: "dataSourceLink",
      attrs: { nodeId: null, title, provider: null, spaceId: null, url },
      text: `:content_node_mention[${title}]{url=${url}}`,
    },
    { type: "text", text: " " },
  ];

  const { from: savedCursor } = editor.state.selection;
  const oldDocSize = editor.state.doc.content.size;

  const success = editor.commands.insertContentAt(range, content);

  if (success) {
    remapCaretAfterUrlReplacement(editor, {
      savedCursor,
      oldDocSize,
      replacedTo: range.to,
    });
  }
}

describe("remapCaretAfterUrlReplacement", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory([DataSourceLinkExtension]);
  });

  afterEach(() => {
    editor.destroy();
  });

  it("should keep the caret after text typed past the pasted URL", () => {
    // User pasted a URL then kept typing: "look <URL> here".
    const prefix = "look ";
    editor.commands.insertContent(`${prefix}${PASTED_URL} here`);

    // Caret sits at the very end (after the text typed past the URL).
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);

    const urlFrom = 1 + prefix.length;
    const urlTo = urlFrom + PASTED_URL.length;

    replaceUrlRange(editor, { from: urlFrom, to: urlTo }, "Doc", PASTED_URL);

    // The caret must land at the very end, right after the typed suffix — not
    // back at the inserted node (which would scramble further typing).
    const { from } = editor.state.selection;
    expect(from).toBe(editor.state.doc.content.size - 1);
    expect(editor.state.doc.textBetween(0, from)).toMatch(/here$/);
  });

  it("should not pull the caret back when it sits before the replaced URL", () => {
    const prefix = "look ";
    editor.commands.insertContent(`${prefix}${PASTED_URL}`);

    // Caret moved back into the prefix, before the URL.
    editor.commands.setTextSelection(2);

    const urlFrom = 1 + prefix.length;
    const urlTo = urlFrom + PASTED_URL.length;

    replaceUrlRange(editor, { from: urlFrom, to: urlTo }, "Doc", PASTED_URL);

    // The guard skips the remap for carets before the URL. Without it, the
    // (large, negative) size delta would yank the caret to the document start;
    // instead it follows TipTap's default and stays past the URL position.
    expect(editor.state.selection.from).toBeGreaterThan(urlFrom);
  });
});
