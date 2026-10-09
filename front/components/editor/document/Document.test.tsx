import { Document } from "@app/components/editor/document/Document";
import { documentCommentsPluginKey } from "@app/components/editor/document/DocumentComments";
import type { DocumentProps } from "@app/components/editor/document/types";
import type { DfmMessageVerifier } from "@app/lib/client/dfm_signatures";
import type { DfmAuthor, DfmMessage } from "@app/lib/markdown/dfm";
import datadogLogger from "@app/logger/datadogLogger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
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
const NO_IMAGE_SOURCE = () => null;
const SOURCE = `Hi :comment-start{id=c1}there:comment-end{id=c1}\n\n:::annotations\n::comment{id=c1 status=open}\n\n::message{author=user:usr_daph name="Daph" at=${AT}}\n\nNote.\n:::\n`;

const hasEditor = (
  element: Element | null
): element is HTMLElement & { editor: Editor } =>
  element !== null && "editor" in element && element.editor !== undefined;

async function renderDocument(
  initialContent: string,
  verifyCommentMessage?: DfmMessageVerifier,
  signCommentMessage?: DocumentProps["signCommentMessage"]
) {
  const onSave = vi.fn().mockResolvedValue(new Ok(undefined));
  const { container } = render(
    <Document
      initialContent={initialContent}
      onSave={onSave}
      autosaveDebounceMs={60_000}
      commentAuthor={AUTHOR}
      renderCommentAuthorAvatar={() => null}
      renderCommentBody={(body) => <p>{body}</p>}
      verifyCommentMessage={verifyCommentMessage}
      signCommentMessage={signCommentMessage}
      resolveImageSource={NO_IMAGE_SOURCE}
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

/** The card floating over the text, or null when none shows; a closing one animates out. */
const floatingCard = () =>
  document.querySelector<HTMLElement>(
    '[data-document-comment-card][data-state="open"]'
  );

/** The comment field's own editor, once it has mounted. */
const findCommentField = async (name: string) => {
  const field = await screen.findByRole("textbox", { name });
  if (!hasEditor(field)) {
    throw new Error(`No editor in the ${name} field.`);
  }
  return field;
};

const typeComment = (field: HTMLElement & { editor: Editor }, text: string) =>
  act(() => {
    field.editor.commands.insertContent(text);
  });

describe("Document comments", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
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

    const thread = await screen.findByRole("article", {
      name: "Comment by Daph",
    });
    expect(floatingCard()?.contains(thread)).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(thread));
  });

  it("closes the card on Escape outside its fields and clears the active comment", async () => {
    const { dom, editor } = await renderDocument(SOURCE);

    fireEvent.click(highlight(dom, "c1"));
    const thread = await screen.findByRole("article", {
      name: "Comment by Daph",
    });
    fireEvent.keyDown(thread, { key: "Escape" });

    expect(floatingCard()).toBeNull();
    expect(documentCommentsPluginKey.getState(editor.state)?.activeId).toBe(
      null
    );
    await waitFor(() => expect(document.activeElement).toBe(dom));
  });

  it("keeps a selection on commented text in the editor", async () => {
    const { dom, editor } = await renderDocument(SOURCE);

    act(() => {
      editor.commands.setTextSelection({ from: 4, to: 9 });
    });
    fireEvent.click(highlight(dom, "c1"));

    expect(floatingCard()).toBeNull();
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

  it("writes a new comment in a card floating under the selection", async () => {
    const { dom, editor } = await renderDocument("Hello brave world.\n");

    startComment(dom, editor, "brave");

    const card = await screen.findByRole("article", { name: "New comment" });
    expect(floatingCard()?.contains(card)).toBe(true);
    expect(dom.querySelector("[data-comment-draft]")?.textContent).toBe(
      "brave"
    );
    const field = await findCommentField("Comment");
    await waitFor(() => expect(document.activeElement).toBe(field));

    typeComment(field, "Too bold?");
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() =>
      expect(screen.queryByRole("article", { name: "New comment" })).toBeNull()
    );
    expect(
      screen.getByRole("article", { name: "Comment by Tom" }).textContent
    ).toContain("Too bold?");
  });

  it("focuses a new comment's field after the comments list was opened and closed", async () => {
    const { dom, editor } = await renderDocument("Hello brave world.\n");

    fireEvent.click(screen.getByRole("button", { name: "Comments" }));
    fireEvent.click(screen.getByRole("button", { name: "Close comments" }));
    startComment(dom, editor, "brave");
    const field = await findCommentField("Comment");

    await waitFor(() => expect(document.activeElement).toBe(field));
  });

  it("cancels an empty new comment on a pointer press outside the card", async () => {
    const { dom, editor } = await renderDocument("Hello brave world.\n");
    const before = JSON.stringify(editor.getJSON());

    startComment(dom, editor, "brave");
    await findCommentField("Comment");
    fireEvent.pointerDown(dom);

    expect(screen.queryByRole("article", { name: "New comment" })).toBeNull();
    expect(JSON.stringify(editor.getJSON())).toBe(before);
  });

  it("leaves focus on the field pressed outside an empty new comment", async () => {
    const { dom, editor } = await renderDocument("Hello brave world.\n");
    const other = document.createElement("input");
    document.body.appendChild(other);

    try {
      startComment(dom, editor, "brave");
      const field = await findCommentField("Comment");
      await waitFor(() => expect(document.activeElement).toBe(field));
      fireEvent.pointerDown(other);
      other.focus();
      await act(
        () =>
          new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
      );

      expect(screen.queryByRole("article", { name: "New comment" })).toBeNull();
      expect(document.activeElement).toBe(other);
    } finally {
      other.remove();
    }
  });

  it("keeps an empty new comment on a pointer press inside the card", async () => {
    const { dom, editor } = await renderDocument("Hello brave world.\n");

    startComment(dom, editor, "brave");
    fireEvent.pointerDown(await findCommentField("Comment"));

    expect(screen.getByRole("article", { name: "New comment" })).toBeDefined();
  });

  it("keeps the draft and its text on a pointer press outside the card", async () => {
    const { dom, editor } = await renderDocument("Hello brave world.\n");

    startComment(dom, editor, "brave");
    const field = await findCommentField("Comment");
    typeComment(field, "Too bold?");
    fireEvent.pointerDown(dom);

    expect(screen.getByRole("article", { name: "New comment" })).toBeDefined();
    expect(field.editor.getText()).toBe("Too bold?");
  });

  it("freezes a new comment and shows progress while the server signs it", async () => {
    let finishSigning = () => undefined as unknown;
    const sign = vi.fn(
      (_commentId: string, _thread: DfmMessage[], body: string) =>
        new Promise<Result<DfmMessage, string>>((resolve) => {
          finishSigning = () =>
            resolve(new Ok({ author: AUTHOR, createdAt: AT, body }));
        })
    );
    const { dom, editor } = await renderDocument(
      "Hello brave world.\n",
      undefined,
      sign
    );

    startComment(dom, editor, "brave");
    const field = await findCommentField("Comment");
    typeComment(field, "Too bold?");
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sending" })).toBeDefined()
    );
    expect(field.editor.isEditable).toBe(false);
    fireEvent.keyDown(field, { key: "Enter" });
    expect(sign).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishSigning();
    });

    expect(screen.queryByRole("article", { name: "New comment" })).toBeNull();
  });

  it("keeps a new comment and its text on Escape while it is being sent", async () => {
    let finishSigning = () => undefined as unknown;
    const sign = vi.fn(
      (_commentId: string, _thread: DfmMessage[], body: string) =>
        new Promise<Result<DfmMessage, string>>((resolve) => {
          finishSigning = () =>
            resolve(new Ok({ author: AUTHOR, createdAt: AT, body }));
        })
    );
    const { dom, editor } = await renderDocument(
      "Hello brave world.\n",
      undefined,
      sign
    );

    startComment(dom, editor, "brave");
    const field = await findCommentField("Comment");
    typeComment(field, "Too bold?");
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sending" })).toBeDefined()
    );
    fireEvent.keyDown(field, { key: "Escape" });

    expect(screen.getByRole("article", { name: "New comment" })).toBeDefined();
    expect(field.editor.getText()).toBe("Too bold?");

    await act(async () => {
      finishSigning();
    });
  });

  it("gives focus back to the field once a refused comment is no longer pending", async () => {
    let refuse = () => undefined as unknown;
    const sign = vi.fn(
      () =>
        new Promise<Result<DfmMessage, string>>((resolve) => {
          refuse = () => resolve(new Err("Could not sign."));
        })
    );
    const { dom, editor } = await renderDocument(
      "Hello brave world.\n",
      undefined,
      sign
    );

    startComment(dom, editor, "brave");
    const field = await findCommentField("Comment");
    await waitFor(() => expect(document.activeElement).toBe(field));
    typeComment(field, "Too bold?");
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sending" })).toBeDefined()
    );
    // Browsers move focus out of a field that is no longer editable.
    act(() => field.blur());

    await act(async () => {
      refuse();
    });

    expect(screen.getByRole("alert").textContent).toBe("Could not sign.");
    await waitFor(() => expect(document.activeElement).toBe(field));
  });

  it("cancels the draft on Escape and keeps the document unchanged", async () => {
    const { dom, editor } = await renderDocument("Hello brave world.\n");
    const before = JSON.stringify(editor.getJSON());

    startComment(dom, editor, "brave");
    fireEvent.keyDown(await findCommentField("Comment"), { key: "Escape" });

    expect(screen.queryByRole("article", { name: "New comment" })).toBeNull();
    expect(JSON.stringify(editor.getJSON())).toBe(before);
  });

  it("does not submit line breaks alone", async () => {
    const sign = vi.fn();
    const { dom, editor } = await renderDocument(
      "Hello brave world.\n",
      undefined,
      sign
    );

    startComment(dom, editor, "brave");
    const field = await findCommentField("Comment");
    act(() => {
      field.editor.chain().setHardBreak().setHardBreak().run();
    });
    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });

    expect(sign).not.toHaveBeenCalled();
    expect(screen.getByRole("article", { name: "New comment" })).toBeDefined();
  });

  it("submits text followed by a line break", async () => {
    const { dom, editor } = await renderDocument("Hello brave world.\n");

    startComment(dom, editor, "brave");
    const field = await findCommentField("Comment");
    typeComment(field, "Too bold?");
    act(() => {
      field.editor.commands.setHardBreak();
    });
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() =>
      expect(
        screen.getByRole("article", { name: "Comment by Tom" }).textContent
      ).toContain("Too bold?")
    );
  });

  it("keeps the draft on Escape while an input method is composing", async () => {
    const { dom, editor } = await renderDocument("Hello brave world.\n");

    startComment(dom, editor, "brave");
    const field = await findCommentField("Comment");
    typeComment(field, "Too bold?");
    fireEvent.keyDown(field, { key: "Escape", isComposing: true });

    expect(screen.getByRole("article", { name: "New comment" })).toBeDefined();
    expect(field.editor.getText()).toBe("Too bold?");
  });

  it("lists open threads in document order and unfolds the picked one", async () => {
    const thread = (id: string, name: string, replies = "") =>
      `::comment{id=${id} status=open}\n\n::message{author=user:u name="${name}" at=${AT}}\n\nNote ${id}.\n${replies}`;
    const reply = `\n::message{author=user:v name="Val" at=${AT}}\n\nAgreed.\n`;
    const { editor } = await renderDocument(
      `:comment-start{id=a}One:comment-end{id=a} two :comment-start{id=b}three:comment-end{id=b}\n\n:::annotations\n${thread("b", "Bea", reply)}\n${thread("a", "Al")}:::\n`
    );

    fireEvent.click(screen.getByRole("button", { name: /^Comments/ }));

    const list = screen.getByRole("complementary", { name: "Comments" });
    expect(
      within(list)
        .getAllByRole("article")
        .map((article) => article.getAttribute("aria-label"))
    ).toEqual(["Comment by Al", "Comment by Bea"]);
    const bea = within(list).getByRole("article", { name: "Comment by Bea" });
    expect(bea.textContent).toContain("1 reply");
    expect(bea.textContent).not.toContain("Agreed.");

    fireEvent.click(within(bea).getByRole("button", { name: /three/ }));

    expect(editor.state.doc.textContent).toBe("One two three");
    expect(bea.getAttribute("aria-current")).toBe("true");
    expect(bea.textContent).toContain("Agreed.");
    expect(floatingCard()).toBeNull();
  });

  it("closes the comments list when a comment starts", async () => {
    const { dom, editor } = await renderDocument("Hello brave world.\n");

    fireEvent.click(screen.getByRole("button", { name: "Comments" }));
    expect(
      screen.getByRole("complementary", { name: "Comments" })
    ).toBeDefined();
    startComment(dom, editor, "brave");

    expect(
      screen.queryByRole("complementary", { name: "Comments" })
    ).toBeNull();
    expect(
      await screen.findByRole("article", { name: "New comment" })
    ).toBeDefined();
  });

  it("renders the host's avatars only for threads on screen", async () => {
    render(
      <Document
        initialContent={SOURCE}
        renderCommentBody={(body) => <p>{body}</p>}
        renderCommentAuthorAvatar={(author, size) => (
          <span data-testid={`avatar:${author.kind}:${author.id}:${size}`} />
        )}
        resolveImageSource={NO_IMAGE_SOURCE}
      />
    );
    const toggle = await screen.findByRole("button", { name: /^Comments/ });

    expect(screen.queryByTestId("avatar:user:usr_daph:xxs")).toBeNull();

    fireEvent.click(toggle);

    expect(screen.getByTestId("avatar:user:usr_daph:xxs")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Close comments" }));

    await waitFor(() =>
      expect(screen.queryByTestId("avatar:user:usr_daph:xxs")).toBeNull()
    );
  });

  it.each([
    [false, 1],
    [true, 0],
  ])(
    "marks a message as unverified only when its check fails (verified: %s)",
    async (verified, marks) => {
      const { dom } = await renderDocument(SOURCE, async () => verified);

      fireEvent.click(highlight(dom, "c1"));

      await waitFor(() =>
        expect(screen.queryAllByText("Unverified")).toHaveLength(marks)
      );
    }
  );

  it("applies a suggestion from its card and resolves the thread", async () => {
    const { dom, editor } = await renderDocument(
      SOURCE.replace("Note.", "Note.\n\n```suggestion\nover here\n```")
    );

    fireEvent.click(highlight(dom, "c1"));
    const thread = screen.getByRole("article", { name: "Comment by Daph" });
    expect(thread.textContent).toContain("Suggested change");
    fireEvent.click(within(thread).getByRole("button", { name: "Apply" }));

    expect(editor.getText()).toBe("Hi over here");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Apply" })).toBeNull()
    );
  });

  it("shows each suggestion of a message as its own card", async () => {
    const { dom, editor } = await renderDocument(
      SOURCE.replace(
        "Note.",
        "Note.\n\nOption 1\n\n```suggestion\nover here\n```\n\nOption 2\n\n```suggestion\nyonder\n```"
      )
    );

    fireEvent.click(highlight(dom, "c1"));
    const thread = screen.getByRole("article", { name: "Comment by Daph" });
    expect(thread.textContent).toMatch(
      /Option 1[\s\S]*Suggested change[\s\S]*over here[\s\S]*Option 2[\s\S]*Suggested change[\s\S]*yonder/
    );
    fireEvent.click(
      within(thread).getAllByRole("button", { name: "Apply" })[1]
    );

    expect(editor.getText()).toBe("Hi yonder");
  });

  it("offers no Apply for a suggestion that is not one paragraph", async () => {
    const { dom } = await renderDocument(
      SOURCE.replace("Note.", "Note.\n\n```suggestion\n# Title\n```")
    );

    fireEvent.click(highlight(dom, "c1"));
    const thread = screen.getByRole("article", { name: "Comment by Daph" });
    expect(thread.textContent).toContain("Suggested change");
    expect(within(thread).queryByRole("button", { name: "Apply" })).toBeNull();
  });

  it("shows a blank suggestion as deleting the text", async () => {
    const { dom } = await renderDocument(
      SOURCE.replace("Note.", "Note.\n\n```suggestion\n   \n```")
    );

    fireEvent.click(highlight(dom, "c1"));
    const thread = screen.getByRole("article", { name: "Comment by Daph" });
    expect(thread.textContent).toContain("Deletes the text.");
  });

  it("inserts the selected text as a suggestion in a new comment", async () => {
    const { dom, editor } = await renderDocument("Hello brave world.\n");

    startComment(dom, editor, "brave");
    const field = await findCommentField("Comment");
    typeComment(field, "Softer?");
    fireEvent.click(screen.getByRole("button", { name: "Suggest a change" }));

    expect(field.editor.getMarkdown().trim()).toBe(
      "Softer?\n\n```suggestion\nbrave\n```"
    );
    const { from, to } = field.editor.state.selection;
    expect(field.editor.state.doc.textBetween(from, to)).toBe("brave");
    expect(
      within(field).getByText("Suggested change", { exact: false })
    ).toBeDefined();
  });
});

describe("Document for a file the editor cannot open", () => {
  const renderRefused = (initialContent: string) =>
    render(
      <Document
        initialContent={initialContent}
        onSave={vi.fn().mockResolvedValue(new Ok(undefined))}
        commentAuthor={AUTHOR}
        renderCommentAuthorAvatar={() => null}
        renderCommentBody={(body) => <p>{body}</p>}
        resolveImageSource={NO_IMAGE_SOURCE}
      />
    );

  it("renders the body read-only, without anchors or threads, under the reason", async () => {
    // A table: valid DFM the editor cannot keep.
    const { container } = renderRefused(
      `# Plan\n\nSee :comment-start{id=c1}this:comment-end{id=c1}.\n\n| Step | Owner |\n| --- | --- |\n| Ship | Daph |\n\n:::annotations\n::comment{id=c1 status=open}\n\n::message{author=user:usr_daph name="Daph" at=${AT}}\n\nNote.\n:::\n`
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This document uses formatting the editor doesn't support yet, so it can't be edited here."
    );
    expect(screen.getByRole("heading", { name: "Plan" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Ship" })).toBeInTheDocument();
    expect(container.textContent).not.toContain("comment-start");
    expect(container.textContent).not.toContain("::message");
    expect(container.querySelector(".tiptap")).toBeNull();
  });

  it("logs a refused document once, with its reason and without its content", async () => {
    const warn = vi.spyOn(datadogLogger, "warn");
    const source =
      "Intro.\n\n| Step | Owner |\n| --- | --- |\n| Ship | Secret |\n";

    // A live document mounts again for each connection.
    renderRefused(source).unmount();
    renderRefused(source);
    await screen.findByRole("alert");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      {
        reason: "The Markdown uses formatting the editor cannot keep: a table.",
      },
      "Document opened read-only"
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain("Secret");
    warn.mockRestore();
  });

  it("shows text too heavy to parse as plain text instead of rendering it", async () => {
    // Out of the codec's bounds: the Markdown renderer parses with the same parser.
    const deep = `${">".repeat(1_000)} too deep`;
    const { container } = renderRefused(`# Notes\n\n${deep}\n`);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(container.querySelector("pre")).toHaveTextContent("too deep");
    expect(screen.queryByRole("heading", { name: "Notes" })).toBeNull();
  });

  it("shows the exact text of a file the codec cannot read", async () => {
    // An anchor without a thread: invalid DFM, whose syntax is what needs fixing.
    const { container } = renderRefused(
      "# Notes\n\nHello :comment-start{id=x}world:comment-end{id=x}.\n"
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(container.querySelector("pre")).toHaveTextContent(
      "Hello :comment-start{id=x}world:comment-end{id=x}."
    );
    expect(screen.queryByRole("heading", { name: "Notes" })).toBeNull();
    expect(container.querySelector(".tiptap")).toBeNull();
  });
});

describe("Document images", () => {
  const renderImages = async (
    resolveImageSource: DocumentProps["resolveImageSource"]
  ) => {
    const { container } = render(
      <Document
        initialContent={
          "![Chart](pod-abc/chart.png)\n\n![Logo](https://example.com/logo.png) and text\n"
        }
        renderCommentAuthorAvatar={() => null}
        renderCommentBody={(body) => <p>{body}</p>}
        resolveImageSource={resolveImageSource}
      />
    );
    return waitFor(() => {
      const element = container.querySelector(".tiptap");
      if (!hasEditor(element)) {
        throw new Error("Editor did not mount.");
      }
      return element;
    });
  };

  it("shows an image from the URL the host resolves, and alt text otherwise", async () => {
    const dom = await renderImages((src) =>
      src.startsWith("pod-") ? `https://files.test/${src}` : null
    );

    const image = within(dom).getByRole("img", { name: "Chart" });
    expect(image.getAttribute("src")).toBe(
      "https://files.test/pod-abc/chart.png"
    );
    expect(within(dom).queryByRole("img", { name: "Logo" })).toBeNull();
    expect(within(dom).getByText("Logo")).toBeDefined();
  });

  it("shows a resolved image as busy until it loads", async () => {
    const dom = await renderImages((src) =>
      src.startsWith("pod-") ? `https://files.test/${src}` : null
    );
    const image = within(dom).getByRole("img", { name: "Chart" });

    expect(image.getAttribute("aria-busy")).toBe("true");
    fireEvent.load(image);
    expect(image.getAttribute("aria-busy")).toBeNull();
  });

  it("keeps an image's destination when its HTML is pasted back", async () => {
    const dom = await renderImages((src) =>
      src.startsWith("pod-") ? `https://files.test/${src}` : null
    );
    const image = within(dom).getByRole("img", { name: "Chart" });

    act(() => {
      dom.editor.commands.insertContentAt(
        dom.editor.state.doc.content.size,
        `<p>${image.outerHTML}</p>`
      );
    });

    const markdown = dom.editor.getMarkdown();
    expect(markdown.match(/!\[Chart\]\(pod-abc\/chart\.png\)/g)).toHaveLength(
      2
    );
    expect(markdown).not.toContain("files.test");
  });

  it("shows every image as its alt text when the host resolves none", async () => {
    const dom = await renderImages(NO_IMAGE_SOURCE);

    expect(within(dom).queryAllByRole("img")).toHaveLength(0);
    expect(within(dom).getByText("Chart")).toBeDefined();
  });

  it("shows new images through the latest resolver without rebuilding the editor", async () => {
    const element = (
      resolveImageSource: DocumentProps["resolveImageSource"]
    ) => (
      <Document
        initialContent={"Intro\n"}
        renderCommentAuthorAvatar={() => null}
        renderCommentBody={(body) => <p>{body}</p>}
        resolveImageSource={resolveImageSource}
      />
    );
    const { container, rerender } = render(
      element((src) => `https://old.test/${src}`)
    );
    const mounted = () => {
      const dom = container.querySelector(".tiptap");
      if (!hasEditor(dom)) {
        throw new Error("Editor did not mount.");
      }
      return dom;
    };
    const { editor } = await waitFor(mounted);

    rerender(element((src) => `https://new.test/${src}`));
    const dom = mounted();
    act(() => {
      dom.editor.commands.insertContentAt(
        dom.editor.state.doc.content.size,
        '<p><img data-document-image="pod-abc/chart.png" data-alt="Chart"></p>'
      );
    });

    expect(dom.editor).toBe(editor);
    expect(
      within(dom).getByRole("img", { name: "Chart" }).getAttribute("src")
    ).toBe("https://new.test/pod-abc/chart.png");
  });
});
