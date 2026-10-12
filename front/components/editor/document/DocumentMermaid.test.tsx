import { buildCollabExtensions } from "@app/components/editor/document/collabExtensions";
import {
  parseDocumentContent,
  serializeDocumentMarkdown,
} from "@app/components/editor/document/content";
import { DocumentView } from "@app/components/editor/document/DocumentEditor";
import { MERMAID_RENDER_DELAY_MS } from "@app/components/editor/document/DocumentMermaid";
import { dfmToYDoc } from "@app/lib/api/collab/ydoc";
import type { CommentChannel } from "@app/lib/client/collab/comments";
import { i18n } from "@app/lib/i18n/i18n";
import { CollabUserFactory } from "@app/tests/utils/CollabUserFactory";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import mermaid from "mermaid";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom cannot lay out a diagram. This Mermaid renders a chart as an SVG holding its text, with a
// link for a `click` line, fails on a chart containing "invalid" and, as the real one does, then
// removes the element carrying the id it rendered.
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (id: string, chart: string) => {
      if (chart.includes("invalid")) {
        document.getElementById(id)?.remove();
        throw new Error("Syntax error in text.");
      }
      const link = chart.includes("click")
        ? '<a href="https://example.com">Open</a>'
        : "";
      return {
        svg: `<svg id="${id}" data-mermaid-diagram=""><text>${chart}</text>${link}</svg>`,
      };
    }),
  },
}));

const FLOWCHART = "graph TD\n  A --> B";
const REFUSED_NOTE =
  "This diagram isn't shown because it refers to another website.";
const fence = (code: string, language = "mermaid") =>
  `Intro\n\n\`\`\`${language}\n${code}\n\`\`\``;

const hasEditor = (
  element: Element | null
): element is HTMLElement & { editor: Editor } =>
  element !== null && "editor" in element && element.editor !== undefined;

type LiveView = ComponentProps<typeof DocumentView>["collabView"];

const NO_COMMENTS: CommentChannel = {
  getThreads: () => [],
  onThreads: () => () => undefined,
  send: vi.fn(),
  close: () => undefined,
};

/** A document is only editable live: binds `content` to a fresh shared document. */
const liveViewOf = (content: string): LiveView => {
  const live = dfmToYDoc(content);
  if (live.isErr()) {
    throw new Error(live.error);
  }
  return {
    status: "live",
    binding: {
      extensions: buildCollabExtensions({
        t: (descriptor) => i18n._(descriptor),
        document: live.value.doc,
        awareness: null,
        user: CollabUserFactory.build(),
        comments: NO_COMMENTS,
        resolveImageSource: () => null,
      }),
      connected: true,
      comments: NO_COMMENTS,
    },
  };
};

const documentElement = (
  content: string,
  readOnly: boolean,
  liveView: LiveView
) => (
  <DocumentView
    initialContent={content}
    readOnly={readOnly}
    collabView={liveView}
    renderCommentAuthorAvatar={() => null}
    renderCommentBody={(body) => <p>{body}</p>}
    resolveImageSource={() => null}
  />
);

async function renderDocument(content: string, readOnly = false) {
  const liveView = liveViewOf(content);
  const { container, rerender } = render(
    documentElement(content, readOnly, liveView)
  );
  const dom = await waitFor(() => {
    const element = container.querySelector(".tiptap");
    if (!hasEditor(element)) {
      throw new Error("Editor did not mount.");
    }
    return element;
  });
  return {
    dom,
    editor: dom.editor,
    setReadOnly: (next: boolean) =>
      rerender(documentElement(content, next, liveView)),
  };
}

const block = (dom: HTMLElement) => {
  const element = dom.querySelector<HTMLElement>("[data-document-mermaid]");
  if (!element) {
    throw new Error("No Mermaid block.");
  }
  return element;
};

/**
 * Whether `element` shows inside `mermaidBlock`, applying the Tailwind classes the block uses as the
 * stylesheet would: jsdom loads none. A `group-data-[...]/mermaid` variant applies while the block
 * is the `group/mermaid` and has that attribute.
 */
const showsInBlock = (element: Element, mermaidBlock: HTMLElement) => {
  for (
    let node: Element | null = element;
    node && node !== mermaidBlock;
    node = node.parentElement
  ) {
    const variant = (attribute: string, display: "block" | "hidden") =>
      mermaidBlock.classList.contains("group/mermaid") &&
      mermaidBlock.hasAttribute(`data-${attribute}`) &&
      node?.classList.contains(`group-data-[${attribute}]/mermaid:${display}`);
    const hidden =
      variant("mermaid-editing", "hidden") ||
      variant("mermaid-no-diagram", "hidden");
    const shown =
      variant("mermaid-editing", "block") ||
      variant("mermaid-no-diagram", "block");
    if (hidden || (!shown && node.classList.contains("hidden"))) {
      return false;
    }
  }
  return true;
};

/** Whether the block shows its code: while editing, or while no diagram shows. */
const showsCode = (mermaidBlock: HTMLElement) => {
  const code = mermaidBlock.querySelector("pre");
  return code !== null && showsInBlock(code, mermaidBlock);
};

/** Whether the block shows a rendered diagram. */
const showsDiagram = (mermaidBlock: HTMLElement) => {
  const diagram = mermaidBlock.querySelector("[data-mermaid-diagram]");
  return diagram !== null && showsInBlock(diagram, mermaidBlock);
};

const diagramText = (dom: HTMLElement) =>
  dom.querySelector("[data-mermaid-diagram]")?.textContent ?? null;

/** The position of the first character of the code block's text. */
const codeStart = (editor: Editor) => {
  let start = -1;
  editor.state.doc.descendants((node, pos) => {
    if (start === -1 && node.type.name === "codeBlock") {
      start = pos + 1;
    }
  });
  return start;
};

describe("Mermaid code blocks", () => {
  beforeEach(() => {
    // Sparkle reads the diagram's theme colors through a canvas, which jsdom lacks.
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      getImageData: () => ({ data: [0, 0, 0, 255] }),
    });
    Element.prototype.scrollIntoView = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    // jsdom lays nothing out; ProseMirror measures ranges when it scrolls to the selection.
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [],
    });
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the mermaid language through load and save", () => {
    const parsed = parseDocumentContent(fence(FLOWCHART));
    if (parsed.isErr()) {
      throw new Error(parsed.error);
    }

    const saved = serializeDocumentMarkdown(parsed.value.document);

    expect(saved.isOk() && saved.value).toBe(fence(FLOWCHART));
  });

  it("shows the diagram in place of the code", async () => {
    const { dom } = await renderDocument(fence(FLOWCHART));

    await waitFor(() => expect(diagramText(dom)).toBe(FLOWCHART));
    expect(showsCode(block(dom))).toBe(false);
    expect(showsDiagram(block(dom))).toBe(true);
  });

  it("shows the code while editing inside it, the diagram again once the selection leaves", async () => {
    const { dom, editor } = await renderDocument(fence(FLOWCHART));
    await waitFor(() => expect(diagramText(dom)).toBe(FLOWCHART));

    act(() => {
      editor
        .chain()
        .focus()
        .setTextSelection(codeStart(editor) + 2)
        .run();
    });
    // The editor focuses on the next frame.
    await waitFor(() => expect(showsCode(block(dom))).toBe(true));
    expect(showsDiagram(block(dom))).toBe(false);

    act(() => {
      editor.commands.setTextSelection(1);
    });
    expect(showsCode(block(dom))).toBe(false);
    expect(showsDiagram(block(dom))).toBe(true);
  });

  it("keeps showing the code while a selection extends from it past the block", async () => {
    const { dom, editor } = await renderDocument(
      `${fence(FLOWCHART)}\n\nAfter`
    );
    await waitFor(() => expect(diagramText(dom)).toBe(FLOWCHART));

    act(() => {
      editor
        .chain()
        .focus()
        .setTextSelection({
          from: codeStart(editor) + 2,
          to: editor.state.doc.content.size - 1,
        })
        .run();
    });

    await waitFor(() => expect(showsCode(block(dom))).toBe(true));
    expect(showsDiagram(block(dom))).toBe(false);
  });

  it("never changes the document while showing the diagram or the code", async () => {
    const { dom, editor } = await renderDocument(fence(FLOWCHART));
    await waitFor(() => expect(diagramText(dom)).toBe(FLOWCHART));
    const before = JSON.stringify(editor.getJSON());

    act(() => {
      editor
        .chain()
        .focus()
        .setTextSelection(codeStart(editor) + 2)
        .run();
    });
    await waitFor(() => expect(showsCode(block(dom))).toBe(true));
    act(() => {
      editor.commands.setTextSelection(1);
    });

    expect(showsDiagram(block(dom))).toBe(true);
    expect(JSON.stringify(editor.getJSON())).toBe(before);
  });

  it("places the cursor in the code when its diagram is clicked", async () => {
    const { dom, editor } = await renderDocument(fence(FLOWCHART));
    const diagram = await waitFor(() => {
      const button = dom.querySelector<HTMLElement>('[role="button"]');
      if (!button) {
        throw new Error("No diagram to click.");
      }
      return button;
    });

    act(() => diagram.click());

    expect(editor.state.selection.from).toBe(codeStart(editor));
    expect(showsCode(block(dom))).toBe(true);
  });

  it.each([
    ["an editable", false],
    ["a read-only", true],
  ])(
    "shows the diagram of %s document opening with it",
    async (_, readOnly) => {
      const { dom, editor } = await renderDocument(
        `\`\`\`mermaid\n${FLOWCHART}\n\`\`\``,
        readOnly
      );
      await waitFor(() => expect(diagramText(dom)).toBe(FLOWCHART));

      // The selection starts in the block, at the document's start.
      expect(editor.state.selection.$from.parent.type.name).toBe("codeBlock");
      expect(showsCode(block(dom))).toBe(false);
      expect(showsDiagram(block(dom))).toBe(true);
    }
  );

  it("enters the code instead of following a link in the diagram", async () => {
    const chart = `${FLOWCHART}\n  click A href "/home"`;
    const { dom, editor } = await renderDocument(fence(chart));
    const link = await waitFor(() => {
      const element = dom.querySelector("[data-mermaid-diagram] a");
      if (!element) {
        throw new Error("No link in the diagram.");
      }
      return element;
    });

    let followed = true;
    act(() => {
      followed = fireEvent.click(link);
    });

    expect(followed).toBe(false);
    expect(editor.state.selection.from).toBe(codeStart(editor));
  });

  it("offers no edit on the diagram of a read-only document", async () => {
    const { dom } = await renderDocument(fence(FLOWCHART), true);
    await waitFor(() => expect(diagramText(dom)).toBe(FLOWCHART));

    expect(dom.querySelector('[role="button"]')).toBeNull();
  });

  it("offers the edit once a read-only document turns editable", async () => {
    const { dom, setReadOnly } = await renderDocument(fence(FLOWCHART), true);
    await waitFor(() => expect(diagramText(dom)).toBe(FLOWCHART));

    setReadOnly(false);

    await waitFor(() =>
      expect(dom.querySelector('[role="button"]')).not.toBeNull()
    );
  });

  it("shows the code with a note while no diagram rendered", async () => {
    const { dom } = await renderDocument(fence("invalid chart"));

    await waitFor(() =>
      expect(dom.textContent).toContain("This diagram has an error.")
    );
    expect(showsCode(block(dom))).toBe(true);
  });

  it("keeps the last diagram, with a note, once its code turns invalid", async () => {
    const { dom, editor } = await renderDocument(fence(FLOWCHART));
    await waitFor(() => expect(diagramText(dom)).toBe(FLOWCHART));
    vi.useFakeTimers();

    act(() => {
      editor.commands.insertContentAt(codeStart(editor), "invalid ");
      editor.commands.setTextSelection(1);
    });
    act(() => {
      vi.advanceTimersByTime(MERMAID_RENDER_DELAY_MS);
    });
    vi.useRealTimers();

    await waitFor(() =>
      expect(dom.textContent).toContain("This diagram has an error.")
    );
    expect(diagramText(dom)).toBe(FLOWCHART);
    expect(showsCode(block(dom))).toBe(false);
    expect(showsDiagram(block(dom))).toBe(true);
  });

  it("shows the code of a chart referring to another website, with a note, and never renders it", async () => {
    const chart = `${FLOWCHART}\n  click A href "https://example.com"`;
    const { dom } = await renderDocument(fence(chart));

    await waitFor(() => expect(dom.textContent).toContain(REFUSED_NOTE));
    expect(showsCode(block(dom))).toBe(true);
    expect(showsDiagram(block(dom))).toBe(false);
    expect(
      vi
        .mocked(mermaid.render)
        .mock.calls.some(([, rendered]) => rendered === chart)
    ).toBe(false);
  });

  it("drops the diagram, for its code and a note, once the chart refers to another website", async () => {
    const { dom, editor } = await renderDocument(fence(FLOWCHART));
    await waitFor(() => expect(diagramText(dom)).toBe(FLOWCHART));
    vi.useFakeTimers();

    act(() => {
      editor.commands.insertContentAt(
        codeStart(editor),
        "%% https://example.com\n"
      );
      editor.commands.setTextSelection(1);
    });
    act(() => {
      vi.advanceTimersByTime(MERMAID_RENDER_DELAY_MS);
    });
    vi.useRealTimers();

    await waitFor(() => expect(dom.textContent).toContain(REFUSED_NOTE));
    expect(showsCode(block(dom))).toBe(true);
    expect(showsDiagram(block(dom))).toBe(false);
  });

  it("shows the code with a note when emptied code turns invalid", async () => {
    const { dom, editor } = await renderDocument(fence(FLOWCHART));
    await waitFor(() => expect(diagramText(dom)).toBe(FLOWCHART));
    const replaceCode = (code: string) =>
      act(() => {
        const from = codeStart(editor);
        const to =
          from + (editor.state.doc.nodeAt(from - 1)?.content.size ?? 0);
        editor
          .chain()
          .insertContentAt({ from, to }, code)
          .setTextSelection(1)
          .run();
      });

    vi.useFakeTimers();
    replaceCode(" ");
    act(() => {
      vi.advanceTimersByTime(MERMAID_RENDER_DELAY_MS);
    });
    replaceCode("invalid chart");
    act(() => {
      vi.advanceTimersByTime(MERMAID_RENDER_DELAY_MS);
    });
    vi.useRealTimers();

    await waitFor(() =>
      expect(dom.textContent).toContain("This diagram has an error.")
    );
    expect(showsCode(block(dom))).toBe(true);
  });

  it("shows other code blocks as before", async () => {
    const { dom } = await renderDocument(fence("const a = 1;", "ts"));

    expect(dom.querySelector("[data-document-mermaid]")).toBeNull();
    expect(dom.querySelector("pre code")?.textContent).toBe("const a = 1;");
  });
});
