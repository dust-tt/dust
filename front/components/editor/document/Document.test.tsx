import { Document } from "@app/components/editor/document/Document";
import { Ok } from "@app/types/shared/result";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const AT = "2026-09-25T14:16:32.380Z";
const SOURCE = `Hi :comment-start{id=c1}there:comment-end{id=c1}\n\n:::annotations\n::comment{id=c1 status=open}\n\n::message{author=user:usr_daph name="Daph" at=${AT}}\n\nNote.\n:::\n`;

const hasEditor = (
  element: Element | null
): element is HTMLElement & { editor: Editor } =>
  element !== null && "editor" in element && element.editor !== undefined;

async function renderDocument(content: string) {
  const onSave = vi.fn().mockResolvedValue(new Ok(undefined));
  const { container } = render(
    <Document content={content} onSave={onSave} autosaveDebounceMs={60_000} />
  );
  const dom = await waitFor(() => {
    const element = container.querySelector(".tiptap");
    if (!hasEditor(element)) {
      throw new Error("Editor did not mount.");
    }
    return element;
  });
  return { dom, editor: dom.editor };
}

const highlight = (dom: HTMLElement, id: string) => {
  const element = dom.querySelector(`[data-comment-highlight="${id}"]`);
  if (!element) {
    throw new Error(`No highlight for ${id}.`);
  }
  return element;
};

describe("Document comments", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
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
});
