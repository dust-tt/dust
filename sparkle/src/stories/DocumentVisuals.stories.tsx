import {
  Document,
  type DocumentProps,
  type DocumentSaveResult,
} from "@sparkle/components/Document";
import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useState } from "react";
import { expect, fn, userEvent, waitFor } from "storybook/test";

const VISUAL_REFERENCE = { type: "dustVisual", attrs: { name: "revenue" } };
const CONTENT = JSON.stringify({
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Quarterly review" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "The team made steady progress." }],
    },
    VISUAL_REFERENCE,
    {
      type: "paragraph",
      content: [{ type: "text", text: "Our next step is a focused pilot." }],
    },
  ],
});

interface RevenueVisualProps {
  quarter: number;
  onNextQuarter: () => void;
}

const RevenueVisual = ({ quarter, onNextQuarter }: RevenueVisualProps) => (
  <figure className="rounded-xl border border-border bg-muted-background p-6">
    <figcaption className="mb-4 font-semibold">
      Illustrative revenue, Q{quarter}
    </figcaption>
    <svg
      role="img"
      aria-label={`Revenue chart for quarter ${quarter}`}
      viewBox="0 0 400 120"
      className="mb-4 h-32 w-full text-primary"
    >
      <rect
        x="10"
        y="60"
        width="70"
        height="60"
        fill="currentColor"
        opacity="0.4"
      />
      <rect
        x="110"
        y="40"
        width="70"
        height="80"
        fill="currentColor"
        opacity="0.6"
      />
      <rect
        x="210"
        y={quarter === 1 ? 20 : 0}
        width="70"
        height={quarter === 1 ? 100 : 120}
        fill="currentColor"
      />
    </svg>
    <button
      type="button"
      onClick={onNextQuarter}
      className="rounded-md border border-border bg-background px-3 py-2 text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span>Show Q{quarter === 1 ? 2 : 1}</span>
    </button>
  </figure>
);

const VisualDocument = (props: DocumentProps) => {
  const [quarter, setQuarter] = useState(1);
  const nextQuarter = () => setQuarter((current) => (current === 1 ? 2 : 1));

  return (
    <Document
      {...props}
      visuals={{
        revenue: (
          <RevenueVisual quarter={quarter} onNextQuarter={nextQuarter} />
        ),
      }}
    />
  );
};

const meta = {
  title: "Documents/Document Visuals",
  component: Document,
  args: {
    initialContent: CONTENT,
    contentType: "json",
    onSave: fn(async (): Promise<DocumentSaveResult> => ({ ok: true })),
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  render: (args) => <VisualDocument {...args} />,
} satisfies Meta<typeof Document>;
export default meta;
type Story = StoryObj<typeof meta>;

/** @summary React visuals remain interactive while text saves preserve their named reference. */
export const InteractiveVisual: Story = {
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.click(canvas.getByRole("button", { name: "Show Q2" }));
    await expect(
      canvas.getByRole("img", { name: "Revenue chart for quarter 2" })
    ).toBeVisible();
    await expect(args.onSave).not.toHaveBeenCalled();

    await userEvent.click(editor.querySelector("p")!);
    await userEvent.keyboard(" With an update.");
    await userEvent.click(canvas.getByRole("button", { name: "Show Q1" }));
    await expect(editor).toHaveTextContent("With an update.");
    await userEvent.click(editor.querySelector("p")!);
    await userEvent.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(VISUAL_REFERENCE))
      )
    );
  },
};

/** @summary An unavailable visual keeps its place in the saved document. */
export const MissingVisual: Story = {
  render: (args) => <Document {...args} />,
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await expect(
      canvas.getByText("Visual “revenue” is unavailable.")
    ).toBeVisible();
    await userEvent.click(editor.querySelector("p")!);
    await userEvent.keyboard(" Keep this reference.{Control>}s{/Control}");
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(VISUAL_REFERENCE))
      )
    );
  },
};

/** @summary Read-only documents still render interactive visuals without enabling text edits. */
export const ReadOnlyVisual: Story = {
  args: { readOnly: true },
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await expect(editor).toHaveAttribute("contenteditable", "false");
    await userEvent.click(canvas.getByRole("button", { name: "Show Q2" }));
    await expect(
      canvas.getByRole("img", { name: "Revenue chart for quarter 2" })
    ).toBeVisible();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** @summary Markdown saves refuse to discard a visual that cannot round-trip through Markdown. */
export const MarkdownSave: Story = {
  args: { saveFormat: "markdown" },
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.click(editor.querySelector("p")!);
    await userEvent.keyboard(" Keep this visual.{Control>}s{/Control}");
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "cannot be saved as Markdown"
    );
    await expect(
      canvas.getByRole("img", { name: "Revenue chart for quarter 1" })
    ).toBeVisible();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};
