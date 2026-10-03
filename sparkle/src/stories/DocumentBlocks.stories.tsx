import {
  Document,
  type DocumentSaveResult,
} from "@sparkle/components/Document";
import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useState } from "react";
import {
  expect,
  fireEvent,
  fn,
  userEvent,
  waitFor,
  within,
} from "storybook/test";

const VISUAL_REFERENCE = { type: "dustVisual", attrs: { name: "chart" } };
const CONTENT = JSON.stringify({
  type: "doc",
  attrs: {
    comments: [
      {
        id: "pilot",
        body: "Keep this paragraph with the launch plan.",
        author: { name: "Maya Chen" },
        createdAt: "2026-09-24T10:00:00Z",
        resolved: false,
        replies: [],
      },
    ],
  },
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Launch plan" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Start with a focused pilot.",
          marks: [{ type: "comment", attrs: { id: "pilot" } }],
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Measure the results." }],
            },
          ],
        },
      ],
    },
    VISUAL_REFERENCE,
    {
      type: "paragraph",
      content: [{ type: "text", text: "Then expand to the next team." }],
    },
  ],
});

const Chart = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <figure className="rounded-lg border border-border p-6">
      <figcaption className="mb-3 font-semibold">Pilot results</figcaption>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="rounded-md border border-border px-3 py-1 text-sm"
      >
        {expanded ? "Hide details" : "Show details"}
      </button>
      {expanded && <p>Four teams completed the pilot.</p>}
    </figure>
  );
};

const meta = {
  title: "Documents/Document Blocks",
  component: Document,
  decorators: [
    (Story) => (
      <React.StrictMode>
        <Story />
      </React.StrictMode>
    ),
  ],
  args: {
    initialContent: CONTENT,
    contentType: "json",
    visuals: { chart: <Chart /> },
    autosaveDebounceMs: 50,
    onSave: fn(async (): Promise<DocumentSaveResult> => ({ ok: true })),
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  render: (args) => <Document {...args} />,
} satisfies Meta<typeof Document>;
export default meta;
type Story = StoryObj<typeof meta>;

const showHandle = async (canvasElement: HTMLElement, block: HTMLElement) => {
  const rect = block.getBoundingClientRect();
  fireEvent.mouseMove(block, {
    clientX: rect.left + 4,
    clientY: rect.top + 10,
  });
  const handle = await within(canvasElement).findByRole("button", {
    name: "Move block",
  });
  await expect(handle).toBeVisible();
  return handle;
};

const dragBlock = async (
  canvasElement: HTMLElement,
  editor: HTMLElement,
  block: HTMLElement,
  target: HTMLElement,
  side: "before" | "after"
) => {
  const handle = await showHandle(canvasElement, block);
  const rect = handle.getBoundingClientRect();
  const dataTransfer = new DataTransfer();
  fireEvent.dragStart(handle, {
    dataTransfer,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  });

  const targetRect = target.getBoundingClientRect();
  const drop = {
    dataTransfer,
    clientX: side === "before" ? targetRect.left + 4 : targetRect.right - 4,
    clientY: side === "before" ? targetRect.top + 1 : targetRect.bottom - 1,
  };
  fireEvent.dragOver(editor, drop);
  fireEvent.drop(editor, drop);
  fireEvent.dragEnd(handle, { dataTransfer });
};

const blockTypes = (editor: HTMLElement) =>
  Array.from(editor.children, (block) => block.tagName);

const historyShortcut = async (redo = false) => {
  const modifier = /Mac|iP(hone|ad|od)/.test(navigator.platform)
    ? "Meta"
    : "Control";
  await userEvent.keyboard(
    redo
      ? `{${modifier}>}{Shift>}z{/Shift}{/${modifier}}`
      : `{${modifier}>}z{/${modifier}}`
  );
};

/** @summary Drag blocks by their left gutter handle, or click the handle to select a block. */
export const BlockDocument: Story = {};

/** @summary Clicking the handle selects the entire block for keyboard editing. */
export const SelectBlock: Story = {
  tags: ["!manifest"],
  play: async ({ canvas, canvasElement }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    const list = within(editor).getByRole("list");
    const handle = await showHandle(canvasElement, list);
    await userEvent.click(handle);
    await waitFor(() => expect(editor).toHaveFocus());
    await userEvent.keyboard("{Backspace}");
    await expect(within(editor).queryByRole("list")).not.toBeInTheDocument();
    await expect(editor).toHaveTextContent("Start with a focused pilot.");
    await historyShortcut();
    await waitFor(() =>
      expect(within(editor).getByRole("list")).toHaveTextContent(
        "Measure the results."
      )
    );
  },
};

/** @summary Block moves in Markdown documents save through the existing Markdown callback. */
export const MarkdownBlocks: Story = {
  args: {
    initialContent: "# Launch plan\n\nFirst paragraph.\n\nSecond paragraph.",
    contentType: "markdown",
    saveFormat: "markdown",
  },
  play: async ({ canvas, canvasElement, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await dragBlock(
      canvasElement,
      editor,
      within(editor).getByText("First paragraph."),
      within(editor).getByText("Second paragraph."),
      "after"
    );
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith(
        expect.stringMatching(/Second paragraph\.\s+First paragraph\./)
      )
    );
  },
};

/** @summary Moving paragraphs and lists preserves comments, autosaves and supports undo and redo. */
export const ReorderBlocks: Story = {
  tags: ["!manifest"],
  play: async ({ canvas, canvasElement, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    const originalOrder = blockTypes(editor);
    const paragraph = within(editor)
      .getByText("Start with a focused pilot.")
      .closest("p")!;
    const last = within(editor).getByText("Then expand to the next team.");

    await dragBlock(canvasElement, editor, paragraph, last, "after");
    await waitFor(() =>
      expect(editor.lastElementChild).toHaveTextContent(
        "Start with a focused pilot."
      )
    );
    await expect(
      editor.querySelector('[data-comment-highlight="pilot"]')
    ).toHaveTextContent("Start with a focused pilot.");
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith(
        expect.stringContaining('"type":"comment","attrs":{"id":"pilot"}')
      )
    );
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.stringContaining(
        '"body":"Keep this paragraph with the launch plan."'
      )
    );

    editor.focus();
    await historyShortcut();
    await waitFor(() => expect(blockTypes(editor)).toEqual(originalOrder));
    await historyShortcut(true);
    await waitFor(() =>
      expect(editor.lastElementChild).toHaveTextContent(
        "Start with a focused pilot."
      )
    );

    const list = within(editor).getByRole("list");
    const heading = within(editor).getByRole("heading", {
      name: "Launch plan",
    });
    await dragBlock(canvasElement, editor, list, heading, "before");
    await waitFor(() =>
      expect(editor.firstElementChild).toHaveTextContent("Measure the results.")
    );
    await expect(within(editor).getAllByRole("listitem")).toHaveLength(1);
  },
};

/** @summary Custom visual blocks move as a whole and retain their interactive controls. */
export const ReorderVisual: Story = {
  tags: ["!manifest"],
  play: async ({ canvas, canvasElement, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    const visual = within(editor).getByRole("figure");
    const heading = within(editor).getByRole("heading", {
      name: "Launch plan",
    });
    await dragBlock(canvasElement, editor, visual, heading, "before");
    await waitFor(() =>
      expect(editor.firstElementChild).toHaveTextContent("Pilot results")
    );
    await userEvent.click(
      within(editor).getByRole("button", { name: "Show details" })
    );
    await expect(
      within(editor).getByText("Four teams completed the pilot.")
    ).toBeVisible();
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(VISUAL_REFERENCE))
      )
    );
  },
};

/** @summary Read-only documents hide drag handles and keep visuals interactive. */
export const ReadOnly: Story = {
  args: { readOnly: true },
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.hover(
      within(editor).getByRole("heading", { name: "Launch plan" })
    );
    await expect(
      canvas.queryByRole("button", { name: "Move block", hidden: true })
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(editor).getByRole("button", { name: "Show details" })
    );
    await expect(
      within(editor).getByText("Four teams completed the pilot.")
    ).toBeVisible();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};
