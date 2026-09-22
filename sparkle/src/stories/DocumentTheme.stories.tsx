import { Document, type DocumentProps } from "@sparkle/components/Document";
import { parseDocumentContent } from "@sparkle/components/Document/content";
import type { DocumentTheme } from "@sparkle/components/Document/DocumentTheme";
import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useState } from "react";
import { expect, fn, userEvent, waitFor } from "storybook/test";

const CONTENT = JSON.stringify({
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "One document, many directions" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "The visual treatment belongs to the theme. The words stay yours.",
        },
      ],
    },
    { type: "dustVisual", attrs: { name: "example" } },
  ],
});
const EDITORIAL: DocumentTheme = {
  bodyFont: "serif",
  headingFont: "serif",
  accent: "#8a452e",
  bodySize: 18,
};
const TECHNICAL: DocumentTheme = {
  bodyFont: "sans",
  headingFont: "mono",
  accent: "#245d85",
  bodySize: 16,
};

const ThemeDemo = (args: DocumentProps) => {
  const [technical, setTechnical] = useState(false);
  return (
    <>
      <button
        type="button"
        className="m-4 rounded-lg border border-border px-4 py-2"
        onClick={() => setTechnical((value) => !value)}
      >
        Change theme
      </button>
      <Document {...args} theme={technical ? TECHNICAL : EDITORIAL} />
    </>
  );
};

const meta = {
  title: "Documents/Document Theme",
  component: Document,
  parameters: { layout: "fullscreen" },
  args: {
    initialContent: CONTENT,
    contentType: "json",
    autosaveDebounceMs: 100,
    onSave: fn(async () => ({ ok: true as const })),
    renderVisual: ({ name }) => (
      <figure aria-label={name} className="rounded-lg border border-border p-6">
        A host-supplied visual.
      </figure>
    ),
  },
  render: (args) => <ThemeDemo {...args} />,
} satisfies Meta<typeof Document>;
export default meta;
type Story = StoryObj<typeof meta>;

/** @summary A theme update changes presentation without replacing the editor or saving content. */
export const SwitchTheme: Story = {
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await waitFor(() => expect(getComputedStyle(editor).fontSize).toBe("18px"));
    const heading = canvas.getByRole("heading", {
      name: "One document, many directions",
    });
    await expect(getComputedStyle(heading).fontFamily).toContain("Lora");
    await userEvent.click(canvas.getByRole("button", { name: "Change theme" }));
    await waitFor(() => expect(getComputedStyle(editor).fontSize).toBe("16px"));
    await expect(getComputedStyle(heading).fontFamily).toContain("Geist Mono");
    await expect(
      canvas.getByRole("textbox", { name: "Document content" })
    ).toBe(editor);
    await expect(args.onSave).not.toHaveBeenCalled();
    await userEvent.click(editor);
    await userEvent.keyboard(" Editable.");
    await waitFor(() => expect(args.onSave).toHaveBeenCalled());
  },
};

/** @summary The shared parser rejects code-bearing and malformed visual nodes. */
export const VisualValidation: Story = {
  play: async ({ canvas }) => {
    await canvas.findByRole("figure", { name: "example" });
    for (const attrs of [
      { name: "example", code: "alert(1)" },
      { name: "../script" },
    ]) {
      await expect(
        parseDocumentContent(
          JSON.stringify({
            type: "doc",
            content: [{ type: "dustVisual", attrs }],
          }),
          "json"
        ).ok
      ).toBe(false);
    }
    await expect(
      parseDocumentContent(
        JSON.stringify({
          type: "doc",
          content: Array.from({ length: 11 }, () => ({
            type: "dustVisual",
            attrs: { name: "example" },
          })),
        }),
        "json"
      ).ok
    ).toBe(false);
  },
};
