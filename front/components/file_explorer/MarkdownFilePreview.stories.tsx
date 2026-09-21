import { MarkdownFilePreview } from "@app/components/file_explorer/MarkdownFilePreview";
import type { DocumentSaveResult } from "@dust-tt/sparkle";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { useState } from "react";
import { expect, fn, userEvent, waitFor } from "storybook/test";

const MARKDOWN =
  "# Project brief\n\nA document for the team.\n\n## Next steps\n\n- Review the proposal\n- Share feedback";
const AUTOSAVE_TIMEOUT_MS = 5_000;

const PreviewWithPersistence = (
  props: ComponentProps<typeof MarkdownFilePreview>
) => {
  const [content, setContent] = useState(props.content);

  return (
    <MarkdownFilePreview
      {...props}
      content={content}
      documentKey={0}
      onSave={async (markdown) => {
        const result = (await props.onSave?.(markdown)) ?? { ok: true };
        if (result.ok) {
          setContent(markdown);
        }
        return result;
      }}
    />
  );
};

const placeCaretAtEnd = (editor: HTMLElement) => {
  editor.focus();
  const range = editor.ownerDocument.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const selection = editor.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  editor.ownerDocument.dispatchEvent(new Event("selectionchange"));
};

const meta = {
  title: "Product/Files/Markdown Document",
  component: MarkdownFilePreview,
  args: {
    content: MARKDOWN,
    canEdit: true,
    onSave: fn(async (): Promise<DocumentSaveResult> => ({ ok: true })),
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  decorators: [
    (Story) => (
      <div className="h-screen p-4">
        <Story />
      </div>
    ),
  ],
  render: (args) => <PreviewWithPersistence {...args} />,
} satisfies Meta<typeof MarkdownFilePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Open directly in the editor and autosave Markdown without mode or save controls. */
export const Editing: Story = {
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await expect(editor).toHaveAttribute("contenteditable", "true");
    await expect(
      canvas.queryByRole("button", {
        name: /Save|Revert|Editing|Viewing|Source/,
      })
    ).not.toBeInTheDocument();
    placeCaretAtEnd(editor);
    await userEvent.keyboard("{Enter}A new idea.");
    await waitFor(
      () =>
        expect(args.onSave).toHaveBeenCalledWith(
          expect.stringContaining("A new idea.")
        ),
      { timeout: AUTOSAVE_TIMEOUT_MS }
    );
    await expect(
      canvas.getByRole("textbox", { name: "Document content" })
    ).toBe(editor);
    await expect(canvas.getByRole("status")).toHaveTextContent(/^Saved$/);
  },
};

/** @summary Preserve unsupported Markdown unchanged with a clear explanation. */
export const UnsupportedMarkdown: Story = {
  args: {
    content:
      "# Owners\n\n![Team](team.png)\n\n| Task | Owner |\n| --- | --- |\n| Review | Sam |",
  },
  play: async ({ canvas, canvasElement, args }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "doesn't support images"
    );
    await expect(canvasElement.querySelector("pre")?.textContent).toBe(
      args.content
    );
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** @summary Failed autosave keeps the draft editable and exposes Retry. */
export const FailedSave: Story = {
  args: {
    onSave: fn(
      async (): Promise<DocumentSaveResult> => ({
        ok: false,
        error: "The file could not be saved. Try again.",
      })
    ),
  },
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    placeCaretAtEnd(editor);
    await userEvent.keyboard(" Keep this draft.");
    await waitFor(
      () =>
        expect(canvas.getByRole("alert")).toHaveTextContent(
          "could not be saved"
        ),
      { timeout: AUTOSAVE_TIMEOUT_MS }
    );
    await expect(editor).toHaveAttribute("contenteditable", "true");
    await expect(editor).toHaveTextContent("Keep this draft.");
    await expect(canvas.getByRole("button", { name: "Retry" })).toBeEnabled();
    await expect(args.onSave).toHaveBeenCalledTimes(1);
  },
};

/** @summary Restricted files remain read-only without editing controls or persistence. */
export const ReadOnly: Story = {
  args: { canEdit: false },
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await expect(editor).toHaveAttribute("contenteditable", "false");
    await userEvent.dblClick(
      canvas.getByRole("heading", { name: "Project brief" })
    );
    await expect(editor).toHaveAttribute("contenteditable", "false");
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};
