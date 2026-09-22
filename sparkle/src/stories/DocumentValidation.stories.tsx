import {
  Document,
  type DocumentSaveResult,
} from "@sparkle/components/Document";
import {
  DOCUMENT_MAX_BYTES,
  parseDocumentContent,
} from "@sparkle/components/Document/content";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { JSONContent } from "@tiptap/core";
import React from "react";
import { expect, fn, spyOn, userEvent, waitFor } from "storybook/test";

const paragraph = (text: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
const sourceWith = (block: JSONContent) =>
  JSON.stringify({ type: "doc", content: [block] });
const linkedParagraph = (attrs: Record<string, unknown>): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text: "Dust", marks: [{ type: "link", attrs }] }],
});

const meta = {
  title: "Documents/Document Validation",
  component: Document,
  args: {
    contentType: "json",
    initialContent: sourceWith(paragraph("A document with a fixed schema.")),
    onSave: fn(async (): Promise<DocumentSaveResult> => ({ ok: true })),
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  render: (args) => <Document {...args} />,
} satisfies Meta<typeof Document>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Reject unsupported fields and invalid attributes before mounting an editor. */
export const InvalidContent: Story = {
  args: {
    initialContent: sourceWith(
      linkedParagraph({ href: { value: "https://dust.tt" } })
    ),
  },
  play: async ({ canvas, args }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "invalid attributes"
    );
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
    await expect(args.onSave).not.toHaveBeenCalled();

    const invalid: JSONContent[] = [
      { type: "iframe", attrs: { src: "https://dust.tt" } },
      { ...paragraph("Text"), attrs: { onclick: "void(0)" } },
      {
        type: "heading",
        attrs: { level: 99 },
        content: [{ type: "text", text: "Title" }],
      },
      {
        type: "codeBlock",
        attrs: { language: ["script"] },
        content: [{ type: "text", text: "Code" }],
      },
      { type: "paragraph", text: "This field would be discarded." },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Text", marks: [{ type: "script" }] }],
      },
      linkedParagraph({ href: "javascript:void(0)" }),
      linkedParagraph({ href: "java\nscript:void(0)" }),
      linkedParagraph({ href: "data:text/html,hello" }),
      linkedParagraph({ href: ["https://dust.tt"] }),
      linkedParagraph({ href: "https://dust.tt", target: "_top" }),
      linkedParagraph({ href: "https://dust.tt", rel: "opener" }),
      linkedParagraph({ href: "https://dust.tt", class: "fixed inset-0" }),
    ];
    for (const block of invalid) {
      await expect(parseDocumentContent(sourceWith(block), "json").ok).toBe(
        false
      );
    }
    await expect(
      parseDocumentContent(
        '{"type":"doc","unexpected":true,"content":[{"type":"paragraph"}]}',
        "json"
      ).ok
    ).toBe(false);
    await expect(
      parseDocumentContent(
        '{"type":"doc","content":[{"type":"paragraph","attrs":{"__proto__":{}}}]}',
        "json"
      ).ok
    ).toBe(false);
  },
};

/** @summary Keep HTML-like text literal, and preserve ordinary rich content across serialization. */
export const LiteralText: Story = {
  args: {
    initialContent: sourceWith(
      paragraph('<img src="x" onerror="void(0)"><script>void(0)</script>')
    ),
  },
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await expect(editor).toHaveTextContent('<img src="x"');
    await expect(editor.querySelector("img,script,iframe")).toBeNull();
    await expect(args.onSave).not.toHaveBeenCalled();

    const parsed = parseDocumentContent(
      '# Brief\n\n**Bold** and [Dust](https://dust.tt "Dust").\n\n3. A step\n\n```c++\ncode\n```',
      "markdown"
    );
    await expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      await expect(
        parseDocumentContent(JSON.stringify(parsed.content), "json")
      ).toEqual(parsed);
    }
  },
};

/** @summary Reject excessive bytes, nodes and nesting without rendering or rewriting them. */
export const BoundedContent: Story = {
  args: { readOnly: true },
  play: async ({ canvas, args }) => {
    await canvas.findByRole("textbox", { name: "Document content" });
    let nested: JSONContent = paragraph("Too deep");
    for (let depth = 0; depth < 100; depth += 1) {
      nested = { type: "blockquote", content: [nested] };
    }
    const cases = [
      sourceWith(nested),
      sourceWith(paragraph("é".repeat(DOCUMENT_MAX_BYTES / 2))),
      JSON.stringify({
        type: "doc",
        content: Array.from({ length: 10_001 }, () => ({
          type: "horizontalRule",
        })),
      }),
    ];
    for (const source of cases) {
      await expect(parseDocumentContent(source, "json").ok).toBe(false);
    }
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** @summary Open external links without an opener and keep presentation fixed. */
export const SafeLinks: Story = {
  args: {
    initialContent: sourceWith(linkedParagraph({ href: "https://dust.tt" })),
  },
  beforeEach: () => {
    const open = spyOn(window, "open").mockReturnValue(null);
    return () => open.mockRestore();
  },
  play: async ({ canvas, args }) => {
    const link = await canvas.findByRole("link", { name: "Dust" });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    const bounds = link.getBoundingClientRect();
    await userEvent.pointer({
      keys: "[MouseLeft]",
      target: link,
      coords: {
        clientX: bounds.left + bounds.width / 2,
        clientY: bounds.top + bounds.height / 2,
      },
    });
    await expect(window.open).toHaveBeenCalledWith(
      "https://dust.tt",
      "_blank",
      "noopener,noreferrer"
    );
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** @summary Read-only links use the browser with a fixed target and no opener. */
export const ReadOnlyLinks: Story = {
  args: { ...SafeLinks.args, readOnly: true },
  play: async ({ canvas, args }) => {
    const link = await canvas.findByRole("link", { name: "Dust" });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** @summary Pasted links cannot override the document's target, rel or styling. */
export const PastedLinks: Story = {
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.click(editor);
    const clipboard = new DataTransfer();
    clipboard.setData(
      "text/html",
      '<p><a href="https://dust.tt" target="_top" rel="opener" class="fixed inset-0" onclick="void(0)">Pasted link</a></p>'
    );
    editor.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: clipboard,
        bubbles: true,
        cancelable: true,
      })
    );

    const link = await canvas.findByRole("link", { name: "Pasted link" });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).not.toHaveClass("fixed");
    await expect(link).not.toHaveAttribute("onclick");
    await userEvent.keyboard("{Control>}s{/Control}");
    await expect(args.onSave).toHaveBeenCalled();
    await expect(canvas.getByRole("status")).toHaveTextContent(/^Saved$/);
  },
};

/** @summary Invalid paste preserves earlier edits and lets their autosave finish. */
export const RejectedPastePreservesDraft: Story = {
  args: { autosaveDebounceMs: 500 },
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.click(editor);
    await userEvent.keyboard("A valid edit. ");
    const draft = editor.textContent;
    const clipboard = new DataTransfer();
    clipboard.setData(
      "text/html",
      `<p><a href="https://dust.tt" title="${"x".repeat(1_025)}">Rejected link</a></p>`
    );
    editor.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: clipboard,
        bubbles: true,
        cancelable: true,
      })
    );

    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "That change was not applied."
    );
    await expect(editor.textContent).toBe(draft);
    await waitFor(() => expect(args.onSave).toHaveBeenCalled());
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.stringContaining("A valid edit.")
    );
    await expect(args.onSave).not.toHaveBeenCalledWith(
      expect.stringContaining("Rejected link")
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(/^Saved$/);
    await userEvent.keyboard("Still editable. ");
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
};

/** @summary Clipboard byte and document nesting limits reject paste without changing content. */
export const OversizedPaste: Story = {
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.click(editor);
    const original = editor.textContent;
    const clipboard = new DataTransfer();
    clipboard.setData("text/html", `<p>${"x".repeat(DOCUMENT_MAX_BYTES)}</p>`);
    editor.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: clipboard,
        bubbles: true,
        cancelable: true,
      })
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "pasted content exceeds"
    );
    await expect(editor.textContent).toBe(original);

    const nestedClipboard = new DataTransfer();
    nestedClipboard.setData(
      "text/html",
      `<div data-pm-slice='0 0 []'>${"<blockquote>".repeat(70)}<p>Too deeply nested</p>${"</blockquote>".repeat(70)}</div>`
    );
    editor.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: nestedClipboard,
        bubbles: true,
        cancelable: true,
      })
    );
    await waitFor(() =>
      expect(canvas.getByRole("alert")).toHaveTextContent(
        "too many nested blocks"
      )
    );
    await expect(editor.textContent).toBe(original);
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** @summary Hosts can prevent navigation while edits or a save are pending. */
export const PendingChanges: Story = {
  args: { onPendingChangesChange: fn(), autosaveDebounceMs: 500 },
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await expect(args.onPendingChangesChange).toHaveBeenLastCalledWith(false);
    await userEvent.click(editor);
    await userEvent.keyboard("More notes.");
    await expect(args.onPendingChangesChange).toHaveBeenLastCalledWith(true);
    await waitFor(() => expect(args.onSave).toHaveBeenCalled());
    await expect(args.onPendingChangesChange).toHaveBeenLastCalledWith(false);
  },
};
