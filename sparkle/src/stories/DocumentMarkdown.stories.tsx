import {
  Document,
  type DocumentProps,
  type DocumentSaveResult,
} from "@sparkle/components/Document";
import { parseDocumentContent } from "@sparkle/components/Document/content";
import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

const AUTOSAVE_DEBOUNCE_MS = 500;
const MARKDOWN =
  '# Project brief\n\nKeep **important details**, *emphasis*, ~~old ideas~~, and `inline code`.\n\n## Next steps\n\n- First item\n  - Nested item\n\n3. Third step\n4. Fourth step\n\n> A useful quotation.\n\n[Dust](https://dust.tt "Workspace")\n\n---\n\n```ts\nconst ready = true;\n```\n\nAdd a note here.';

const meta = {
  title: "Documents/Document Markdown",
  component: Document,
  decorators: [
    (Story) => (
      <React.StrictMode>
        <Story />
      </React.StrictMode>
    ),
  ],
  args: {
    initialContent: MARKDOWN,
    saveFormat: "markdown",
    autosaveDebounceMs: AUTOSAVE_DEBOUNCE_MS,
    onSave: fn(async (): Promise<DocumentSaveResult> => ({ ok: true })),
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  render: (args) => <Document {...args} />,
} satisfies Meta<typeof Document>;

export default meta;
type Story = StoryObj<typeof meta>;

const placeCaretAtEnd = (element: HTMLElement) => {
  element.focus();
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = element.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  element.ownerDocument.dispatchEvent(new Event("selectionchange"));
};

const MarkdownSavePreview = ({ onSave, ...props }: DocumentProps) => {
  const [saved, setSaved] = useState<string | null>(null);

  return (
    <>
      <section aria-label="Editable document">
        <Document
          {...props}
          onSave={
            onSave
              ? async (content) => {
                  const result = await onSave(content);
                  if (result.ok) {
                    setSaved(content);
                  }
                  return result;
                }
              : undefined
          }
        />
      </section>
      {saved !== null && (
        <section aria-label="Saved document" className="border-t border-border">
          <Document key={saved} initialContent={saved} readOnly />
        </section>
      )}
    </>
  );
};

/** @summary Save Markdown and reopen it with headings, lists, links, and formatting intact. */
export const MarkdownOutput: Story = {
  render: (args) => <MarkdownSavePreview {...args} />,
  play: async ({ canvas, args }) => {
    const document = within(
      canvas.getByRole("region", { name: "Editable document" })
    );
    const editor = await document.findByRole("textbox", {
      name: "Document content",
    });
    await new Promise((resolve) =>
      setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS * 2)
    );
    await expect(args.onSave).not.toHaveBeenCalled();
    placeCaretAtEnd(editor);
    await userEvent.keyboard(" An update.");
    await waitFor(() => expect(args.onSave).toHaveBeenCalledTimes(1));
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.stringContaining("# Project brief")
    );
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.stringContaining("3. Third step")
    );
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.stringContaining("An update.")
    );
    await expect(document.getByRole("status")).toHaveTextContent(/^Saved$/);

    const saved = within(
      await canvas.findByRole("region", { name: "Saved document" })
    );
    const reopened = saved.getByRole("textbox", { name: "Document content" });
    await expect(
      saved.getByRole("heading", { name: "Project brief", level: 1 })
    ).toBeVisible();
    await expect(reopened.querySelector("strong")).toHaveTextContent(
      "important details"
    );
    await expect(reopened.querySelector("em")).toHaveTextContent("emphasis");
    await expect(reopened.querySelector("s")).toHaveTextContent("old ideas");
    await expect(reopened.querySelector("ul ul")).toHaveTextContent(
      "Nested item"
    );
    await expect(reopened.querySelector("ol")).toHaveAttribute("start", "3");
    await expect(reopened.querySelector("blockquote")).toHaveTextContent(
      "A useful quotation."
    );
    await expect(reopened.querySelector("pre code")).toHaveTextContent(
      "const ready = true;"
    );
    await expect(saved.getByRole("link", { name: "Dust" })).toHaveAttribute(
      "href",
      "https://dust.tt"
    );
    await expect(reopened).toHaveTextContent("An update.");
    await new Promise((resolve) =>
      setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS * 2)
    );
    await expect(args.onSave).toHaveBeenCalledTimes(1);
  },
};

/** @summary Preserve unsupported Markdown as read-only source without writing it. */
export const UnsupportedMarkdown: Story = {
  args: {
    initialContent:
      "# Release plan\n\n| Task | Owner |\n| --- | --- |\n| Review | Sam |",
  },
  play: async ({ canvas, canvasElement, args }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "editing is disabled"
    );
    await expect(canvasElement.querySelector("pre")).toHaveTextContent(
      "| Review | Sam |"
    );
    await expect(canvasElement.querySelector("pre")?.textContent).toBe(
      args.initialContent
    );
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("toolbar")).not.toBeInTheDocument();

    for (const source of [
      "Before ![Diagram](https://example.com/diagram.png) after.",
      "- [x] Reviewed\n- [ ] Shipped",
      "Keep <!-- internal note --> this.",
      "[A reference][ref]\n\n[ref]: https://dust.tt",
      "Literal \\*asterisks\\*",
      "~~~ts\nconst ready = true;\n~~~",
      "> | Task | Owner |\n> | --- | --- |\n> | Review | Sam |",
    ]) {
      await expect(parseDocumentContent(source, "markdown")).toEqual({
        ok: false,
      });
    }

    await new Promise((resolve) =>
      setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS * 2)
    );
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** @summary Reject a Markdown conversion that would change the draft when reopened. */
export const UnsafeMarkdownConversion: Story = {
  args: {
    initialContent: JSON.stringify({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          content: [{ type: "text", text: "before\n```\nafter" }],
        },
      ],
    }),
    contentType: "json",
  },
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    placeCaretAtEnd(editor);
    await userEvent.keyboard("A new note.");
    await userEvent.keyboard("{Control>}s{/Control}");
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "cannot be saved as Markdown"
    );
    await expect(editor).toHaveTextContent("A new note.");
    await expect(editor.querySelector("pre")?.textContent).toBe(
      "before\n```\nafter"
    );
    await new Promise((resolve) =>
      setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS * 2)
    );
    await expect(args.onSave).not.toHaveBeenCalled();
    await expect(canvas.getByRole("status")).toHaveTextContent("Not saved");
  },
};

/** @summary Clearing a document persists an empty Markdown string and acknowledges the save. */
export const EmptyMarkdown: Story = {
  args: { initialContent: "Clear this paragraph." },
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.clear(editor);
    await userEvent.keyboard("{Control>}s{/Control}");
    await waitFor(() => expect(args.onSave).toHaveBeenCalledWith(""));
    await expect(canvas.getByRole("status")).toHaveTextContent(/^Saved$/);
    await new Promise((resolve) =>
      setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS * 2)
    );
    await expect(args.onSave).toHaveBeenCalledTimes(1);
  },
};

const ChangingSaveFormat = (props: DocumentProps) => {
  const [format, setFormat] = useState<DocumentProps["saveFormat"]>("json");

  return (
    <>
      <button
        type="button"
        className="m-4 rounded border px-3 py-2"
        onClick={() => setFormat("markdown")}
      >
        Save as Markdown
      </button>
      <Document {...props} saveFormat={format} />
    </>
  );
};

/** @summary Changing the output format preserves the open draft and does not write unchanged content. */
export const SaveFormatChanges: Story = {
  args: { initialContent: "A saved draft." },
  render: (args) => <ChangingSaveFormat {...args} />,
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.click(
      canvas.getByRole("button", { name: "Save as Markdown" })
    );
    await new Promise((resolve) =>
      setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS * 2)
    );
    await expect(args.onSave).not.toHaveBeenCalled();
    placeCaretAtEnd(editor);
    await userEvent.keyboard(" An edit.");
    await userEvent.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith("A saved draft. An edit.")
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(/^Saved$/);
  },
};
