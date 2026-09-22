import {
  Document,
  type DocumentFrameReference,
  type DocumentSaveResult,
} from "@sparkle/components/Document";
import {
  DOCUMENT_MAX_FRAMES,
  parseDocumentContent,
  serializeDocumentMarkdown,
} from "@sparkle/components/Document/content";
import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

const FRAME_PATH = "conversation-demo/chart/index.tsx";
const SOURCE = JSON.stringify({
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Quarterly review" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "The chart stays interactive inside the document.",
        },
      ],
    },
    {
      type: "dustFrame",
      attrs: { src: FRAME_PATH, title: "Revenue by quarter" },
    },
    { type: "paragraph", content: [{ type: "text", text: "Next steps." }] },
  ],
});

const ExampleFrame = ({ title }: DocumentFrameReference) => {
  const [showTargets, setShowTargets] = useState(false);
  return (
    <div className="flex flex-col gap-4 p-5">
      <div
        className="flex h-32 items-end justify-around gap-3"
        role="img"
        aria-label={`${title}, increasing over four quarters`}
      >
        {[40, 55, 68, 85].map((value, index) => (
          <div
            key={value}
            className="flex h-full flex-1 flex-col items-center justify-end gap-1"
          >
            <div
              className="w-full max-w-16 rounded-t bg-highlight"
              style={{ height: `${value}%` }}
            />
            <span className="text-muted-foreground copy-xs">Q{index + 1}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="self-start rounded border border-border px-3 py-1 copy-sm"
        onClick={() => setShowTargets((current) => !current)}
      >
        {showTargets ? "Hide targets" : "Show targets"}
      </button>
      {showTargets && <p>Targets are visible.</p>}
    </div>
  );
};

const CompactExampleFrame = () => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="p-4">
      <button
        type="button"
        className="rounded border border-border px-3 py-1 copy-sm"
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? "Hide details" : "Show details"}
      </button>
      {expanded && <p className="mt-4">More detail from this Frame.</p>}
    </div>
  );
};

const meta = {
  title: "Documents/Document Frames",
  component: Document,
  args: {
    initialContent: SOURCE,
    contentType: "json",
    renderFrame: fn((reference: DocumentFrameReference) => (
      <ExampleFrame {...reference} />
    )),
    onSave: fn(async (): Promise<DocumentSaveResult> => ({ ok: true })),
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  render: (args) => <Document {...args} />,
} satisfies Meta<typeof Document>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Interact with an embedded Frame and edit surrounding text without losing its reference. */
export const FrameInDocument: Story = {
  play: async ({ canvas, args }) => {
    const frame = within(
      await canvas.findByRole("region", { name: "Revenue by quarter" })
    );
    await userEvent.click(frame.getByRole("button", { name: "Show targets" }));
    await expect(frame.getByText("Targets are visible.")).toBeVisible();
    await expect(args.onSave).not.toHaveBeenCalled();

    const paragraph = canvas.getByText("Next steps.");
    await userEvent.click(paragraph);
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    await userEvent.keyboard(" Review this chart.{Control>}s{/Control}");
    await waitFor(() => expect(args.onSave).toHaveBeenCalled());
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.stringContaining('"type":"dustFrame"')
    );
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.stringContaining(FRAME_PATH)
    );
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.stringContaining("Review this chart.")
    );
    await expect(frame.getByText("Targets are visible.")).toBeVisible();

    const parsed = parseDocumentContent(SOURCE, "json");
    await expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      await expect(
        parseDocumentContent(JSON.stringify(parsed.content), "json")
      ).toEqual(parsed);
      await expect(serializeDocumentMarkdown(parsed.content)).toBeNull();
    }
  },
};

/** @summary Document read-only access keeps text immutable while the host owns Frame permissions. */
export const ReadOnlyDocument: Story = {
  args: { readOnly: true },
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await expect(editor).toHaveAttribute("contenteditable", "false");
    await userEvent.click(
      await canvas.findByRole("button", { name: "Show targets" })
    );
    await expect(canvas.getByText("Targets are visible.")).toBeVisible();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** @summary A host without embedding support preserves the block and displays a placeholder. */
export const MissingFrameHost: Story = {
  args: { renderFrame: undefined, readOnly: true },
  play: async ({ canvas, args }) => {
    await expect(
      await canvas.findByText("This Frame is unavailable in this view.")
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Quarterly review" })
    ).toBeVisible();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** @summary Reject remote iframe URLs and caller-selected iframe capabilities. */
export const InvalidFrameReference: Story = {
  args: {
    initialContent: JSON.stringify({
      type: "doc",
      content: [
        {
          type: "dustFrame",
          attrs: { src: "https://dust.tt", title: "Unsupported embed" },
        },
      ],
    }),
  },
  play: async ({ canvas, args }) => {
    await expect(await canvas.findByRole("alert")).toBeVisible();
    await expect(args.renderFrame).not.toHaveBeenCalled();
    await expect(args.onSave).not.toHaveBeenCalled();
    for (const attrs of [
      { src: "https://dust.tt" },
      { src: "/files/conversation-demo/chart/index.tsx" },
      { src: "conversation-demo/../other/index.tsx" },
      { src: FRAME_PATH, sandbox: "allow-same-origin" },
      { src: FRAME_PATH, code: "alert(1)" },
    ]) {
      const source = JSON.stringify({
        type: "doc",
        content: [{ type: "dustFrame", attrs }],
      });
      await expect(parseDocumentContent(source, "json").ok).toBe(false);
    }
  },
};

/** @summary Bound embedded Frame count before an expensive host can mount. */
export const TooManyFrames: Story = {
  args: {
    initialContent: JSON.stringify({
      type: "doc",
      content: Array.from({ length: DOCUMENT_MAX_FRAMES + 1 }, () => ({
        type: "dustFrame",
        attrs: { src: FRAME_PATH },
      })),
    }),
  },
  play: async ({ canvas, args }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      `at most ${DOCUMENT_MAX_FRAMES} Frames`
    );
    await expect(args.renderFrame).not.toHaveBeenCalled();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** @summary HTML attributes outside the Frame clipboard format cannot replace its reference. */
export const PastedFrameReference: Story = {
  args: {
    initialContent: JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph" }],
    }),
  },
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.click(editor);
    const clipboard = new DataTransfer();
    clipboard.setData(
      "text/html",
      `<div data-dust-frame="${FRAME_PATH}" data-dust-frame-title="Pasted chart" src="https://invalid.example" title="Untrusted title">Pasted chart</div>`
    );
    editor.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: clipboard,
        bubbles: true,
        cancelable: true,
      })
    );
    await canvas.findByRole("region", { name: "Pasted chart" });
    await expect(args.renderFrame).toHaveBeenCalledWith({
      src: FRAME_PATH,
      title: "Pasted chart",
    });
    await userEvent.keyboard("{Control>}s{/Control}");
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.stringContaining(FRAME_PATH)
    );
    await expect(args.onSave).not.toHaveBeenCalledWith(
      expect.stringContaining("invalid.example")
    );
  },
};

/** @summary A compact Frame fits its content and remains a selectable document block. */
export const CompactFrame: Story = {
  args: {
    renderFrame: fn((_reference: DocumentFrameReference) => (
      <CompactExampleFrame />
    )),
  },
  play: async ({ canvas, args }) => {
    const frame = await canvas.findByRole("region", {
      name: "Revenue by quarter",
    });
    const initialHeight = frame.getBoundingClientRect().height;
    await expect(initialHeight).toBeLessThan(160);
    await userEvent.click(
      within(frame).getByRole("button", { name: "Show details" })
    );
    await expect(frame.getBoundingClientRect().height).toBeGreaterThan(
      initialHeight
    );
    await userEvent.click(
      within(frame).getByRole("button", { name: "Hide details" })
    );
    await expect(frame.getBoundingClientRect().height).toBeCloseTo(
      initialHeight,
      0
    );
    await expect(args.onSave).not.toHaveBeenCalled();

    const handle = within(frame).getByText("Revenue by quarter");
    await expect(handle).toHaveAttribute("data-drag-handle");
    const bounds = handle.getBoundingClientRect();
    await userEvent.pointer({
      target: handle,
      keys: "[MouseLeft]",
      coords: {
        clientX: bounds.left + bounds.width / 2,
        clientY: bounds.top + bounds.height / 2,
      },
    });
    await userEvent.keyboard("{Backspace}");
    await expect(
      canvas.queryByRole("region", { name: "Revenue by quarter" })
    ).toBeNull();
    const modifier = /Mac|iPhone|iPad/.test(navigator.platform)
      ? "Meta"
      : "Control";
    await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`);
    await expect(
      await canvas.findByRole("region", { name: "Revenue by quarter" })
    ).toBeVisible();
  },
};
