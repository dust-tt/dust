import { LinkExtension } from "@app/components/editor/input_bar/LinkExtension";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { beforeAll, describe, expect, it } from "vitest";

import { EditorFormattingToolbar } from "./EditorFormattingToolbar";

function TestEditor() {
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false }), LinkExtension],
    content: "<p>hello world</p>",
  });

  if (!editor) {
    return null;
  }

  return (
    <div>
      <EditorContent editor={editor} />
      <EditorFormattingToolbar editor={editor} />
    </div>
  );
}

class StubDOMRectList extends Array<DOMRect> implements DOMRectList {
  item(index: number): DOMRect | null {
    return this[index] ?? null;
  }
}

function stubLayout(): void {
  const rect = new DOMRect(30, 10, 30, 10);
  const rects = new StubDOMRectList(rect);

  Range.prototype.getClientRects = () => rects;
  Range.prototype.getBoundingClientRect = () => rect;
  Element.prototype.getClientRects = () => rects;
  window.scrollBy = () => {};
}

describe("EditorFormattingToolbar", () => {
  beforeAll(() => {
    stubLayout();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      value: 1200,
    });
  });

  it("keeps the link dialog open once the editor loses focus to it", async () => {
    const user = userEvent.setup();
    render(<TestEditor />);

    const editorDom = document.querySelector<HTMLElement>(".tiptap");
    expect(editorDom).not.toBeNull();
    editorDom?.focus();
    await user.keyboard("{Control>}a{/Control}");

    const linkButton = await screen.findByRole("button", { name: /link/i });
    await user.click(linkButton);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText("Text")).toHaveValue("hello world");
  });
});
