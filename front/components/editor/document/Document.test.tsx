import { Document } from "@app/components/editor/document/Document";
import type { DfmAuthor } from "@app/lib/markdown/dfm";
import { Ok } from "@app/types/shared/result";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const AUTHOR: DfmAuthor = { kind: "user", id: "usr_tom", name: "Tom" };
const AT = "2026-09-25T14:16:32.380Z";
const SOURCE = `Hi :comment-start{id=c1}there:comment-end{id=c1}\n\n:::annotations\n::comment{id=c1 status=open}\n\n::message{author=user:usr_daph name="Daph" at=${AT}}\n\nNote.\n:::\n`;

const hasEditor = (
  element: Element | null
): element is HTMLElement & { editor: Editor } =>
  element !== null && "editor" in element && element.editor !== undefined;

async function renderDocument(initialContent: string) {
  const onSave = vi.fn().mockResolvedValue(new Ok(undefined));
  const { container } = render(
    <Document
      initialContent={initialContent}
      onSave={onSave}
      autosaveDebounceMs={60_000}
      commentAuthor={AUTHOR}
    />
  );
  const dom = await waitFor(() => {
    const element = container.querySelector(".tiptap");
    if (!hasEditor(element)) {
      throw new Error("Editor did not mount.");
    }
    return element;
  });
  return { dom, editor: dom.editor, onSave };
}

const highlight = (dom: HTMLElement, id: string) => {
  const element = dom.querySelector(`[data-comment-highlight="${id}"]`);
  if (!element) {
    throw new Error(`No highlight for ${id}.`);
  }
  return element;
};

/** Selects `text` and presses Cmd+Alt+M, as a user starting a comment. */
function startComment(dom: HTMLElement, editor: Editor, text: string) {
  act(() => {
    let from = -1;
    editor.state.doc.descendants((node, pos) => {
      if (from === -1 && node.isText && node.text?.includes(text)) {
        from = pos + node.text.indexOf(text);
      }
    });
    editor.commands.setTextSelection({ from, to: from + text.length });
  });
  fireEvent.keyDown(dom, {
    key: "µ",
    code: "KeyM",
    metaKey: true,
    altKey: true,
  });
}

describe("Document comments", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    // jsdom lays nothing out; ProseMirror measures ranges when it scrolls to the selection.
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [],
    });
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
      }),
    });
  });

  it("reveals a comment when its highlight is clicked", async () => {
    const { dom } = await renderDocument(SOURCE);

    fireEvent.click(highlight(dom, "c1"));

    expect(
      screen.getByRole("complementary", { name: "Comments" }).dataset.state
    ).toBe("open");
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("article", { name: "Comment by Daph" })
      )
    );
  });

  it("keeps a selection on commented text in the editor", async () => {
    const { dom, editor } = await renderDocument(SOURCE);

    act(() => {
      editor.commands.setTextSelection({ from: 4, to: 9 });
    });
    fireEvent.click(highlight(dom, "c1"));

    expect(
      screen.getByRole("complementary", { name: "Comments" }).dataset.state
    ).toBe("closed");
    expect(editor.state.selection.empty).toBe(false);
  });

  it("reveals the overlapping comment covering less text first, code included", async () => {
    const thread = (id: string, name: string) =>
      `::comment{id=${id} status=open}\n\n::message{author=user:u name="${name}" at=${AT}}\n\nNote.\n`;
    const { dom } = await renderDocument(
      `:comment-start{id=narrow}pre :comment-start{id=wide}x:comment-end{id=narrow} \`averyveryverylongcode\` y:comment-end{id=wide} post\n\n:::annotations\n${thread("narrow", "Narrow")}\n${thread("wide", "Wide")}:::\n`
    );
    // "x" carries both highlights, one span nested in the other.
    const [both] = [...dom.querySelectorAll("[data-comment-highlight]")].filter(
      (element) => element.parentElement?.closest("[data-comment-highlight]")
    );

    fireEvent.click(both);

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("article", { name: "Comment by Narrow" })
      )
    );
  });

  it("writes a new comment in a card inside the comments panel", async () => {
    const { dom, editor } = await renderDocument("Hello brave world.\n");

    startComment(dom, editor, "brave");

    const panel = screen.getByRole("complementary", { name: "Comments" });
    expect(panel.dataset.state).toBe("open");
    const card = screen.getByRole("article", { name: "New comment" });
    expect(panel.contains(card)).toBe(true);
    expect(card.textContent).toContain("brave");
    const field = screen.getByRole("textbox", { name: "Comment" });
    expect(document.activeElement).toBe(field);

    fireEvent.change(field, { target: { value: "Too bold?" } });
    fireEvent.keyDown(field, { key: "Enter" });

    expect(screen.queryByRole("article", { name: "New comment" })).toBeNull();
    expect(
      screen.getByRole("article", { name: "Comment by Tom" }).textContent
    ).toContain("Too bold?");
  });

  it("focuses a new comment's field after the panel was opened and closed", async () => {
    const { dom, editor } = await renderDocument("Hello brave world.\n");

    fireEvent.click(screen.getByRole("button", { name: "Comments" }));
    fireEvent.click(screen.getByRole("button", { name: "Close comments" }));
    startComment(dom, editor, "brave");

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("textbox", { name: "Comment" })
      )
    );
  });

  it("keeps the draft and its text on a pointer press outside the card", async () => {
    const { dom, editor } = await renderDocument("Hello brave world.\n");

    startComment(dom, editor, "brave");
    const field = screen.getByRole("textbox", { name: "Comment" });
    fireEvent.change(field, { target: { value: "Too bold?" } });
    fireEvent.pointerDown(dom);

    expect(screen.getByRole("article", { name: "New comment" })).toBeDefined();
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveProperty(
      "value",
      "Too bold?"
    );
  });

  it("cancels the draft on Escape and keeps the document unchanged", async () => {
    const { dom, editor } = await renderDocument("Hello brave world.\n");
    const before = JSON.stringify(editor.getJSON());

    startComment(dom, editor, "brave");
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Comment" }), {
      key: "Escape",
    });

    expect(screen.queryByRole("article", { name: "New comment" })).toBeNull();
    expect(JSON.stringify(editor.getJSON())).toBe(before);
  });

  it("places the card among open threads in document order", async () => {
    const thread = (id: string) =>
      `::comment{id=${id} status=open}\n\n::message{author=user:u name="U" at=${AT}}\n\nNote ${id}.\n`;
    const { dom, editor } = await renderDocument(
      `:comment-start{id=a}One:comment-end{id=a} two :comment-start{id=b}three:comment-end{id=b}\n\n:::annotations\n${thread("a")}\n${thread("b")}:::\n`
    );

    startComment(dom, editor, "two");

    const cards = within(
      screen.getByRole("complementary", { name: "Comments" })
    )
      .getAllByRole("article")
      .map((article) => article.getAttribute("aria-label"));
    expect(cards).toEqual(["Comment by U", "New comment", "Comment by U"]);
  });
});
