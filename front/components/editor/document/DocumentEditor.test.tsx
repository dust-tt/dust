import { buildCollabExtensions } from "@app/components/editor/document/collabExtensions";
import { documentCommentsPluginKey } from "@app/components/editor/document/DocumentComments";
import {
  DocumentEditor,
  DocumentView,
  hasOpenDocumentLayer,
} from "@app/components/editor/document/DocumentEditor";
import type {
  CollabParticipant,
  DocumentProps,
  CollabStatus,
} from "@app/components/editor/document/types";
import { dfmToYDoc, yDocToDfm } from "@app/lib/api/collab/ydoc";
import type { CommentChannel } from "@app/lib/client/collab/comments";
import type { DfmMessageVerifier } from "@app/lib/client/dfm_signatures";
import type { DfmAuthor, DfmComment, DfmMessage } from "@app/lib/markdown/dfm";
import datadogLogger from "@app/logger/datadogLogger";
import { CollabAgentFactory } from "@app/tests/utils/CollabAgentFactory";
import { CollabParticipantFactory } from "@app/tests/utils/CollabParticipantFactory";
import { CollabUserFactory } from "@app/tests/utils/CollabUserFactory";
import type {
  CommentRequest,
  CommentRequestErrorCode,
} from "@app/types/collab";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const AUTHOR: DfmAuthor = { kind: "user", id: "usr_tom", name: "Tom" };
const AT = "2026-09-25T14:16:32.380Z";
const NO_IMAGE_SOURCE = () => null;
const SOURCE = `Hi :comment-start{id=c1}there:comment-end{id=c1}\n\n:::annotations\n::comment{id=c1 status=open}\n\n::message{author=user:usr_daph name="Daph" at=${AT}}\n\nNote.\n:::\n`;

const hasEditor = (
  element: Element | null
): element is HTMLElement & { editor: Editor } =>
  element !== null && "editor" in element && element.editor !== undefined;

type SessionAnswer = (
  command: CommentRequest,
  accept: (command: CommentRequest) => LiveCommentAnswer
) => Promise<LiveCommentAnswer>;

type LiveCommentAnswer = Result<DfmComment | null, CommentRequestErrorCode>;

/**
 * A live session's comment side: it applies each command to its threads and sends them, as the
 * server does, writing new messages as `AUTHOR` at `AT`. `answer` answers instead, and can still
 * accept the command.
 */
function commentSession(initialThreads: DfmComment[], answer?: SessionAnswer) {
  let threads = initialThreads;
  const listeners = new Set<(comments: DfmComment[]) => void>();
  const broadcast = (next: DfmComment[]) => {
    threads = next;
    listeners.forEach((listener) => listener(next));
  };
  const message = (body: string): DfmMessage => ({
    author: AUTHOR,
    createdAt: AT,
    body,
  });
  const accept = (command: CommentRequest): LiveCommentAnswer => {
    const others = threads.filter(({ id }) => id !== command.commentId);
    const thread = threads.find(({ id }) => id === command.commentId);
    switch (command.type) {
      case "add": {
        const created: DfmComment = {
          id: command.commentId,
          status: "open",
          messages: [message(command.body)],
        };
        broadcast([...threads, created]);
        return new Ok(created);
      }
      case "reply":
        broadcast(
          threads.map((t) =>
            t === thread
              ? { ...t, messages: [...t.messages, message(command.body)] }
              : t
          )
        );
        return new Ok(null);
      case "resolve":
        broadcast(
          threads.map((t) =>
            t === thread
              ? { ...t, status: command.resolved ? "resolved" : "open" }
              : t
          )
        );
        return new Ok(null);
      case "delete":
        broadcast(others);
        return new Ok(null);
      default:
        return assertNever(command);
    }
  };
  const send = vi.fn(
    async (command: CommentRequest): Promise<LiveCommentAnswer> =>
      answer ? answer(command, accept) : accept(command)
  );
  const channel: CommentChannel = {
    getThreads: () => threads,
    onThreads: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send,
    close: () => listeners.clear(),
  };
  return { channel, send };
}

/** Renders `initialContent` as a live document bound to a fresh shared document. */
async function renderDocument(
  initialContent: string,
  {
    verifyCommentMessage,
    commentInputExtensions,
    answer,
  }: {
    verifyCommentMessage?: DfmMessageVerifier;
    commentInputExtensions?: DocumentProps["commentInputExtensions"];
    answer?: SessionAnswer;
  } = {}
) {
  const live = dfmToYDoc(initialContent);
  if (live.isErr()) {
    throw new Error(live.error);
  }
  const session = commentSession(live.value.comments, answer);
  const { container } = render(
    <DocumentView
      initialContent={initialContent}
      commentAuthor={AUTHOR}
      renderCommentAuthorAvatar={() => null}
      renderCommentBody={(body) => <p>{body}</p>}
      verifyCommentMessage={verifyCommentMessage}
      commentInputExtensions={commentInputExtensions}
      resolveImageSource={NO_IMAGE_SOURCE}
      collabView={{
        status: "live",
        binding: {
          extensions: buildCollabExtensions({
            t: (descriptor) => descriptor.id ?? "",
            document: live.value.doc,
            awareness: null,
            user: CollabUserFactory.build(),
            comments: session.channel,
            resolveImageSource: NO_IMAGE_SOURCE,
          }),
          connected: true,
          comments: session.channel,
        },
      }}
    />
  );
  const dom = await waitFor(() => {
    const element = container.querySelector(".tiptap");
    if (!hasEditor(element)) {
      throw new Error("Editor did not mount.");
    }
    return element;
  });
  return { dom, editor: dom.editor, session, doc: live.value.doc };
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

/** The editor's content element under `root`. */
const editorOf = (root: HTMLElement) => {
  const element = root.querySelector<HTMLElement>(".tiptap");
  if (!element) {
    throw new Error("No editor content.");
  }
  return element;
};

/** Whether `element` comes before the document's content, as the page lays them out. */
const isAbove = (element: Element, content: Element) =>
  !!(
    element.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING
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

  it("freezes a new comment and shows progress while the session creates it", async () => {
    let finishSending = () => undefined as unknown;
    const { dom, editor, session } = await renderDocument(
      "Hello brave world.\n",
      {
        answer: (command, accept) =>
          new Promise((resolve) => {
            finishSending = () => resolve(accept(command));
          }),
      }
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
    expect(session.send).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishSending();
    });

    expect(screen.queryByRole("article", { name: "New comment" })).toBeNull();
  });

  it("keeps a new comment and its text on Escape while it is being sent", async () => {
    let finishSending = () => undefined as unknown;
    const { dom, editor } = await renderDocument("Hello brave world.\n", {
      answer: (command, accept) =>
        new Promise((resolve) => {
          finishSending = () => resolve(accept(command));
        }),
    });

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
      finishSending();
    });
  });

  it("gives focus back to the field once a refused comment is no longer pending", async () => {
    let refuse = () => undefined as unknown;
    const { dom, editor } = await renderDocument("Hello brave world.\n", {
      answer: () =>
        new Promise((resolve) => {
          refuse = () => resolve(new Err("unavailable"));
        }),
    });

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

    expect(screen.getByRole("alert").textContent).toBe(
      "Commenting is unavailable."
    );
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
    const { dom, editor, session } = await renderDocument(
      "Hello brave world.\n"
    );

    startComment(dom, editor, "brave");
    const field = await findCommentField("Comment");
    act(() => {
      field.editor.chain().setHardBreak().setHardBreak().run();
    });
    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });

    expect(session.send).not.toHaveBeenCalled();
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

  it("shows the live status as one icon in the host's status container", async () => {
    const container = document.createElement("span");
    document.body.appendChild(container);
    render(
      <DocumentView
        initialContent={SOURCE}
        collabView={{ status: "live", binding: null }}
        statusContainer={container}
        renderCommentBody={(body) => <p>{body}</p>}
        renderCommentAuthorAvatar={() => null}
        resolveImageSource={NO_IMAGE_SOURCE}
      />
    );

    const status = await within(container).findByRole("status");
    expect(status.dataset.state).toBe("saved");
    expect(status.textContent).toBe("Saved");
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(
      screen.queryAllByRole("status").filter((element) => element !== status)
    ).toHaveLength(0);
    container.remove();
  });

  it("shows the comments button in the host's container when given one", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      <DocumentEditor
        initialContent={SOURCE}
        headerControlsContainer={container}
        resolveImageSource={NO_IMAGE_SOURCE}
        renderCommentBody={(body) => <p>{body}</p>}
        renderCommentAuthorAvatar={() => null}
      />
    );

    const toggle = await within(container).findByRole("button", {
      name: /^Comments/,
    });
    fireEvent.click(toggle);

    expect(
      screen.getByRole("complementary", { name: "Comments" }).dataset.state
    ).toBe("open");
    container.remove();
  });

  it("keeps the live status above the document when the comments button shows in the host's container", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const { container: documentRoot } = render(
      <DocumentView
        initialContent={SOURCE}
        collabView={{ status: "live", binding: null }}
        headerControlsContainer={container}
        resolveImageSource={NO_IMAGE_SOURCE}
        renderCommentBody={(body) => <p>{body}</p>}
        renderCommentAuthorAvatar={() => null}
      />
    );

    const status = await within(documentRoot).findByRole("status");
    expect(status.textContent).toContain("Live");
    expect(isAbove(status, editorOf(documentRoot))).toBe(true);
    expect(within(container).queryByRole("status")).toBeNull();
    expect(
      within(documentRoot).queryByRole("button", { name: /^Comments/ })
    ).toBeNull();
    container.remove();
  });

  it("shows the host's badge above the document, before the live status", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const { container: documentRoot } = render(
      <DocumentView
        initialContent={SOURCE}
        collabView={{ status: "live", binding: null }}
        headerControlsContainer={container}
        badge={<span data-testid="badge" />}
        resolveImageSource={NO_IMAGE_SOURCE}
        renderCommentBody={(body) => <p>{body}</p>}
        renderCommentAuthorAvatar={() => null}
      />
    );

    const status = await within(documentRoot).findByRole("status");
    const badge = within(documentRoot).getByTestId("badge");
    expect(
      badge.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(isAbove(badge, editorOf(documentRoot))).toBe(true);
    expect(within(container).queryByTestId("badge")).toBeNull();
    container.remove();
  });

  it("renders the host's avatars only for threads on screen", async () => {
    render(
      <DocumentEditor
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

  it("shows a marker with its thread's message count beside a comment", async () => {
    const { dom } = await renderDocument(
      SOURCE.replace(
        "Note.\n",
        `Note.\n\n::message{author=user:usr_tom name="Tom" at=${AT}}\n\nAgreed.\n`
      )
    );

    const marker = screen.getByRole("button", {
      name: "Show comment by Daph, 2 messages",
    });
    expect(marker.textContent).toBe("2");

    fireEvent.click(marker);

    expect(highlight(dom, "c1")).toBeDefined();
    expect(
      within(floatingCard()!).getByRole("article", { name: "Comment by Daph" })
    ).toBeDefined();
    expect(marker.getAttribute("aria-current")).toBe("true");
  });

  it("gives each comment of a line its own marker, stacked in the order the comments start", async () => {
    const thread = (id: string, name: string) =>
      `::comment{id=${id} status=open}\n\n::message{author=user:u name="${name}" at=${AT}}\n\nNote ${id}.\n`;
    const { editor } = await renderDocument(
      `:comment-start{id=a}One:comment-end{id=a} two :comment-start{id=b}three:comment-end{id=b}\n\n:::annotations\n${thread("b", "Bea")}\n${thread("a", "Al")}:::\n`
    );

    const al = screen.getByRole("button", {
      name: "Show comment by Al, 1 message",
    });
    const bea = screen.getByRole("button", {
      name: "Show comment by Bea, 1 message",
    });
    expect(Number.parseFloat(bea.style.top)).toBeGreaterThan(
      Number.parseFloat(al.style.top)
    );

    fireEvent.click(bea);

    expect(documentCommentsPluginKey.getState(editor.state)?.activeId).toBe(
      "b"
    );
  });

  it.each([
    [false, 1],
    [true, 0],
  ])(
    "marks a message as unverified only when its check fails (verified: %s)",
    async (verified, marks) => {
      const { dom } = await renderDocument(SOURCE, {
        verifyCommentMessage: async () => verified,
      });

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

  it("adds one suggestion however many times Suggest is pressed", async () => {
    const { dom, editor } = await renderDocument("Hello brave world.\n");

    startComment(dom, editor, "brave");
    const field = await findCommentField("Comment");
    typeComment(field, "Softer?");
    const suggest = screen.getByRole("button", { name: "Suggest a change" });
    fireEvent.click(suggest);
    act(() => {
      field.editor.commands.insertContent("gentle");
      field.editor.commands.setTextSelection(1);
    });
    fireEvent.click(suggest);
    fireEvent.click(suggest);

    expect(field.editor.getMarkdown().trim()).toBe(
      "Softer?\n\n```suggestion\ngentle\n```"
    );
    const { from, to } = field.editor.state.selection;
    expect(field.editor.state.doc.textBetween(from, to)).toBe("gentle");
  });
});

describe("Document live participants", () => {
  const PARTICIPANTS: CollabParticipant[] = [
    CollabParticipantFactory.build({ id: "usr_bob", name: "Bob" }),
    CollabParticipantFactory.build({ id: "usr_ada", name: "Ada" }),
  ];

  const renderCollabView = (
    status: CollabStatus,
    participants: CollabParticipant[],
    headerControlsContainer?: HTMLElement
  ) =>
    render(
      <DocumentView
        initialContent={SOURCE}
        headerControlsContainer={headerControlsContainer}
        collabView={{ status, participants, binding: null }}
        resolveImageSource={NO_IMAGE_SOURCE}
        renderCommentBody={(body) => <p>{body}</p>}
        renderCommentAuthorAvatar={() => null}
        renderCollabParticipants={(shown) => (
          <span data-testid="participants">
            {shown.map(({ name }) => name).join(", ")}
          </span>
        )}
      />
    );

  it("shows the participants right before the comments button in the host's container", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderCollabView("live", PARTICIPANTS, container);

    const toggle = await within(container).findByRole("button", {
      name: /^Comments/,
    });
    const participants = within(container).getByTestId("participants");
    expect(participants.textContent).toBe("Bob, Ada");
    expect(participants.nextElementSibling).toBe(toggle);
    container.remove();
  });

  it("shows the participants with the comments button above the document without a container", async () => {
    const { container } = renderCollabView("live", PARTICIPANTS);

    const toggle = await within(container).findByRole("button", {
      name: /^Comments/,
    });
    const participants = within(container).getByTestId("participants");
    expect(participants.nextElementSibling).toBe(toggle);
    expect(isAbove(participants, editorOf(container))).toBe(true);
  });

  it("shows the agent at work with its avatar before the participants in the host's container", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const { container: documentRoot } = render(
      <DocumentView
        initialContent={SOURCE}
        headerControlsContainer={container}
        collabView={{
          status: "live",
          participants: PARTICIPANTS,
          agent: {
            agent: CollabAgentFactory.build({ agentId: "dust", name: "Dust" }),
            activity: "editing",
          },
          binding: null,
        }}
        resolveImageSource={NO_IMAGE_SOURCE}
        renderCommentBody={(body) => <p>{body}</p>}
        renderCommentAuthorAvatar={(author, size) => (
          <span data-testid={`avatar:${author.kind}:${author.id}:${size}`} />
        )}
        renderCollabParticipants={() => <span data-testid="participants" />}
      />
    );

    const agent = await within(container).findByRole("status", {
      name: "Dust is writing",
    });
    expect(agent.textContent).toBe("writing…");
    expect(within(agent).getByTestId("avatar:agent:dust:xs")).toBeDefined();
    expect(agent.nextElementSibling).toBe(
      within(container).getByTestId("participants")
    );
    expect(
      within(documentRoot).queryByRole("status", { name: "Dust is writing" })
    ).toBeNull();
    container.remove();
  });

  it("shows no participants while the session is not live, or has no one else", async () => {
    const { container, rerender } = renderCollabView("offline", PARTICIPANTS);
    await within(container).findByRole("button", { name: /^Comments/ });
    expect(within(container).queryByTestId("participants")).toBeNull();

    rerender(
      <DocumentView
        initialContent={SOURCE}
        collabView={{ status: "live", participants: [], binding: null }}
        resolveImageSource={NO_IMAGE_SOURCE}
        renderCommentBody={(body) => <p>{body}</p>}
        renderCommentAuthorAvatar={() => null}
        renderCollabParticipants={() => <span data-testid="participants" />}
      />
    );
    expect(within(container).queryByTestId("participants")).toBeNull();
  });
});

describe("Document for a file the editor cannot open", () => {
  const renderRefused = (initialContent: string) =>
    render(
      <DocumentEditor
        initialContent={initialContent}
        commentAuthor={AUTHOR}
        renderCommentAuthorAvatar={() => null}
        renderCommentBody={(body) => <p>{body}</p>}
        resolveImageSource={NO_IMAGE_SOURCE}
      />
    );

  it("renders the body read-only, without anchors or threads, under the reason", async () => {
    // A task list: valid DFM the editor cannot keep.
    const { container } = renderRefused(
      `# Plan\n\nSee :comment-start{id=c1}this:comment-end{id=c1}.\n\n| Step | Owner |\n| --- | --- |\n| Ship | Daph |\n\n- [ ] Review\n\n:::annotations\n::comment{id=c1 status=open}\n\n::message{author=user:usr_daph name="Daph" at=${AT}}\n\nNote.\n:::\n`
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This document can't be edited here yet because it has a task list."
    );
    expect(screen.getByRole("heading", { name: "Plan" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Ship" })).toBeInTheDocument();
    expect(container.textContent).not.toContain("comment-start");
    expect(container.textContent).not.toContain("::message");
    expect(container.querySelector(".tiptap")).toBeNull();
  });

  it("keeps the general note when the refusal names no element", async () => {
    // Mixed bullet markers: supported elements that would not read back the same.
    renderRefused("A\n\n* a\n+ b\n");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This document uses formatting the editor doesn't support yet, so it can't be edited here."
    );
  });

  it("logs a refused document once, with its reason and without its content", async () => {
    const warn = vi.spyOn(datadogLogger, "warn");
    const source = "Intro.\n\n- [ ] Ship to Secret\n";

    // A live document mounts again for each connection.
    renderRefused(source).unmount();
    renderRefused(source);
    await screen.findByRole("alert");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      {
        reason:
          "The Markdown uses formatting the editor cannot keep: a task list.",
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
      <DocumentEditor
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
      <DocumentEditor
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

describe("Document image menu", () => {
  // The width slider measures itself.
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const SOURCE_WITH_IMAGES =
    "![Chart](pod-abc/chart.png) and ![Logo](pod-abc/logo.png)\n";

  const renderImages = async ({
    readOnly = false,
    initialContent = SOURCE_WITH_IMAGES,
  } = {}) => {
    const { container } = render(
      <Document
        initialContent={initialContent}
        onSave={vi.fn().mockResolvedValue(new Ok(undefined))}
        readOnly={readOnly}
        autosaveDebounceMs={60_000}
        renderCommentAuthorAvatar={() => null}
        renderCommentBody={(body) => <p>{body}</p>}
        resolveImageSource={(src) => `https://files.test/${src}`}
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

  const hoverImage = (dom: HTMLElement, name: string) => {
    const image = within(dom).getByRole("img", { name });
    fireEvent.mouseOver(image);
    return image;
  };

  it("shows over a hovered image and hides when the pointer leaves it", async () => {
    const dom = await renderImages();
    expect(screen.queryByRole("toolbar", { name: "Image" })).toBeNull();

    const image = hoverImage(dom, "Chart");
    expect(screen.getByRole("toolbar", { name: "Image" })).toBeInTheDocument();

    fireEvent.mouseOut(image, { relatedTarget: dom });
    expect(screen.queryByRole("toolbar", { name: "Image" })).toBeNull();
  });

  it("stays while the pointer moves from the image onto it", async () => {
    const dom = await renderImages();
    const image = hoverImage(dom, "Chart");
    const menu = screen.getByRole("toolbar", { name: "Image" });

    fireEvent.mouseOut(image, { relatedTarget: menu });
    expect(screen.getByRole("toolbar", { name: "Image" })).toBeInTheDocument();
  });

  it("removes only the hovered image, as one undoable edit", async () => {
    const dom = await renderImages();
    hoverImage(dom, "Logo");

    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));

    expect(dom.editor.getMarkdown()).not.toContain("Logo");
    expect(dom.editor.getMarkdown()).toContain("![Chart](pod-abc/chart.png)");
    expect(screen.queryByRole("toolbar", { name: "Image" })).toBeNull();
    act(() => {
      dom.editor.commands.undo();
    });
    expect(dom.editor.getMarkdown()).toContain("![Logo](pod-abc/logo.png)");
  });

  it("resizes the hovered image with the slider, and back to its original size", async () => {
    const dom = await renderImages({
      initialContent:
        "![Chart|400](pod-abc/chart.png) and ![Logo](pod-abc/logo.png)\n",
    });
    hoverImage(dom, "Chart");

    fireEvent.keyDown(screen.getByRole("slider", { name: "Image width" }), {
      key: "Home",
    });

    expect(dom.editor.getMarkdown()).toContain(
      "![Chart|64](pod-abc/chart.png) and ![Logo](pod-abc/logo.png)"
    );
    expect(within(dom).getByRole("img", { name: "Chart" }).style.width).toBe(
      "64px"
    );

    fireEvent.click(screen.getByRole("button", { name: "Original size" }));

    expect(dom.editor.getMarkdown()).toContain("![Chart](pod-abc/chart.png)");
    expect(screen.queryByRole("button", { name: "Original size" })).toBeNull();
    expect(within(dom).getByRole("img", { name: "Chart" }).style.width).toBe(
      ""
    );
  });

  it("does not show in a read-only document", async () => {
    const dom = await renderImages({ readOnly: true });

    hoverImage(dom, "Chart");

    expect(screen.queryByRole("toolbar", { name: "Image" })).toBeNull();
  });
});

describe("Document Escape inside a host dialog", () => {
  // Radix dialogs prevent the default of every Escape before the document sees it.
  const preventEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
    }
  };

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
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
    document.addEventListener("keydown", preventEscape, { capture: true });
  });

  afterEach(() => {
    document.removeEventListener("keydown", preventEscape, { capture: true });
  });

  it("closes the card and reports no open layer once closed", async () => {
    const { dom, editor } = await renderDocument(SOURCE);

    fireEvent.click(highlight(dom, "c1"));
    const thread = await screen.findByRole("article", {
      name: "Comment by Daph",
    });
    expect(hasOpenDocumentLayer(document)).toBe(true);

    fireEvent.keyDown(thread, { key: "Escape" });

    expect(floatingCard()).toBeNull();
    expect(documentCommentsPluginKey.getState(editor.state)?.activeId).toBe(
      null
    );
    expect(hasOpenDocumentLayer(document)).toBe(false);
  });

  it("clears a reply field on Escape and keeps its card", async () => {
    const { dom } = await renderDocument(SOURCE);

    fireEvent.click(highlight(dom, "c1"));
    const field = await findCommentField("Reply");
    typeComment(field, "Sure.");
    fireEvent.keyDown(field, { key: "Escape" });

    expect(field.editor.getText()).toBe("");
    expect(floatingCard()).not.toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("article", { name: "Comment by Daph" })
      )
    );
  });

  it("closes the comments list on Escape from its button", async () => {
    await renderDocument(SOURCE);
    const toggle = screen.getByRole("button", { name: /^Comments/ });
    fireEvent.click(toggle);
    expect(hasOpenDocumentLayer(document)).toBe(true);

    fireEvent.keyDown(toggle, { key: "Escape" });

    expect(
      screen.queryByRole("complementary", { name: "Comments" })
    ).toBeNull();
    expect(hasOpenDocumentLayer(document)).toBe(false);
  });

  // A suggestion, such as a mention, that stays active in the comment field.
  const ActiveSuggestion = Extension.create({
    name: "activeSuggestion",
    addProseMirrorPlugins: () => [
      new Plugin({
        state: { init: () => ({ active: true }), apply: (_, value) => value },
      }),
    ],
  });

  async function startCommentWithSuggestion() {
    const { dom, editor } = await renderDocument("Hello brave world.\n", {
      commentInputExtensions: [ActiveSuggestion],
    });
    startComment(dom, editor, "brave");
    const field = await findCommentField("Comment");
    typeComment(field, "Too bold?");
    return field;
  }

  it("leaves Escape to a mention list shown from the field", async () => {
    const list = document.createElement("div");
    list.setAttribute("data-suggestion-list", "");
    document.body.appendChild(list);
    const field = await startCommentWithSuggestion();

    fireEvent.keyDown(field, { key: "Escape" });

    expect(screen.getByRole("article", { name: "New comment" })).toBeDefined();
    expect(field.editor.getText()).toBe("Too bold?");
    list.remove();
  });

  it("cancels the draft on Escape when the field's suggestion shows no list", async () => {
    const field = await startCommentWithSuggestion();

    fireEvent.keyDown(field, { key: "Escape" });

    expect(screen.queryByRole("article", { name: "New comment" })).toBeNull();
  });
});

describe("Document tables", () => {
  const TABLE = "| Name | Count |\n| --- | --- |\n| apple | 3 |\n";

  const cellText = (editor: Editor, text: string) => {
    let from = -1;
    editor.state.doc.descendants((node, pos) => {
      if (from === -1 && node.isText && node.text?.includes(text)) {
        from = pos + (node.text?.indexOf(text) ?? 0);
      }
    });
    return { from, to: from + text.length };
  };

  it("writes a cell edit to the session as the table's Markdown", async () => {
    const { editor, doc } = await renderDocument(TABLE);

    act(() => {
      editor
        .chain()
        .setTextSelection(cellText(editor, "apple"))
        .insertContent("pear | plum")
        .run();
    });

    expect(yDocToDfm({ doc, comments: [] })).toEqual(
      new Ok("| Name | Count |\n| --- | --- |\n| pear \\| plum | 3 |\n")
    );
  });

  it("does not split a cell or break its line on Enter", async () => {
    const { dom, editor } = await renderDocument(TABLE);
    const before = editor.state.doc;

    act(() => {
      editor.commands.setTextSelection(cellText(editor, "apple").to);
    });
    for (const modifiers of [{}, { shiftKey: true }, { metaKey: true }]) {
      fireEvent.keyDown(dom, { key: "Enter", ...modifiers });
    }

    expect(editor.state.doc.eq(before)).toBe(true);
  });
});

describe("Document Frame embeds", () => {
  const SOURCE_WITH_FRAME =
    'Intro\n\n::embed_frame{path="pod-abc/dashboards/revenue.tsx"}\n\nOutro\n';

  const renderFrames = async (renderFrame?: DocumentProps["renderFrame"]) => {
    const { container } = render(
      <DocumentEditor
        initialContent={SOURCE_WITH_FRAME}
        renderCommentAuthorAvatar={() => null}
        renderCommentBody={(body) => <p>{body}</p>}
        resolveImageSource={NO_IMAGE_SOURCE}
        renderFrame={renderFrame}
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

  it("shows a Frame through the host's renderer", async () => {
    const dom = await renderFrames((path) => (
      <iframe title={`Frame ${path}`} />
    ));

    expect(
      await within(dom).findByTitle("Frame pod-abc/dashboards/revenue.tsx")
    ).toBeDefined();
  });

  it("shows a Frame as its path without a renderer", async () => {
    const dom = await renderFrames();

    expect(
      await within(dom).findByText("pod-abc/dashboards/revenue.tsx")
    ).toBeDefined();
  });

  it("keeps a Frame's path when its HTML is pasted back", async () => {
    const dom = await renderFrames();
    const html = dom.editor.getHTML();

    act(() => {
      dom.editor.commands.insertContentAt(
        dom.editor.state.doc.content.size,
        html
      );
    });

    expect(
      dom.editor
        .getMarkdown()
        .match(/::embed_frame\{path="pod-abc\/dashboards\/revenue\.tsx"\}/g)
    ).toHaveLength(2);
  });
  it("does not paste a Frame whose path it cannot write", async () => {
    const dom = await renderFrames();

    act(() => {
      dom.editor.commands.insertContentAt(
        dom.editor.state.doc.content.size,
        '<div data-document-frame=""></div><div data-document-frame="pod-abc/a&#10;b.tsx"></div>'
      );
    });

    expect(
      dom.editor.getJSON().content?.filter((node) => node.type === "frameEmbed")
    ).toHaveLength(1);
  });

  it("keeps a Frame mounted when the read-only preview re-renders", async () => {
    const renderPreview = () => (
      <DocumentEditor
        initialContent={`${SOURCE_WITH_FRAME}\n~~~\ncode\n~~~\n`}
        renderCommentAuthorAvatar={() => null}
        renderCommentBody={(body) => <p>{body}</p>}
        resolveImageSource={NO_IMAGE_SOURCE}
        renderFrame={(path) => <iframe title={`Frame ${path}`} />}
      />
    );
    const { rerender } = render(renderPreview());
    const frame = await screen.findByTitle(
      "Frame pod-abc/dashboards/revenue.tsx"
    );

    rerender(renderPreview());

    expect(screen.getByTitle("Frame pod-abc/dashboards/revenue.tsx")).toBe(
      frame
    );
  });

  it("shows in the read-only preview only the Frames the editor reads", async () => {
    const rejected = [
      '::embed_frame{path="pod-abc/b.tsx" title="B"}',
      "::embed_frame{path=pod-abc/c.tsx}",
      '::embed_frame[D]{path="pod-abc/d.tsx"}',
      '   ::embed_frame{path="pod-abc/e.tsx"}',
    ];
    render(
      <DocumentEditor
        initialContent={`${SOURCE_WITH_FRAME}\n${rejected.join("\n\n")}\n\n> ::embed_frame{path="pod-abc/quoted.tsx"}\n\n- ::embed_frame{path="pod-abc/listed.tsx"}\n\n~~~\ncode\n~~~\n`}
        renderCommentAuthorAvatar={() => null}
        renderCommentBody={(body) => <p>{body}</p>}
        resolveImageSource={NO_IMAGE_SOURCE}
        renderFrame={(path) => <iframe title={`Frame ${path}`} />}
      />
    );

    await screen.findByTitle("Frame pod-abc/dashboards/revenue.tsx");
    expect(screen.getByTitle("Frame pod-abc/quoted.tsx")).toBeDefined();
    expect(screen.getAllByTitle(/^Frame /)).toHaveLength(2);
    for (const line of rejected) {
      expect(screen.getByText(line.trim())).toBeDefined();
    }
    expect(
      screen.getByText('::embed_frame{path="pod-abc/listed.tsx"}')
    ).toBeDefined();
  });
});
