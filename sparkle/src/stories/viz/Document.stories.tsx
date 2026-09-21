import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { VizContext } from "../../../../viz/app/components/VizContext";
import {
  Document,
  type DocumentSaveResult,
} from "../../../../viz/components/dust/document/v1";

const EDITABLE_VIEW = { isEditable: true, isPdfMode: false, editText: null };
const READ_ONLY_VIEW = { ...EDITABLE_VIEW, isEditable: false };
const PDF_VIEW = { ...EDITABLE_VIEW, isPdfMode: true };

const SEED =
  "# Team update\n\nA short document, ready to edit.\n\n- Review the proposal\n- Share feedback";
const meta = {
  title: "Documents/Document",
  component: Document,
  decorators: [
    (Story) => (
      <React.StrictMode>
        <VizContext.Provider value={EDITABLE_VIEW}>
          <Story />
        </VizContext.Provider>
      </React.StrictMode>
    ),
  ],
  args: {
    initialContent: SEED,
    onSave: fn(async (): Promise<DocumentSaveResult> => ({ ok: true })),
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof Document>;
export default meta;
type Story = StoryObj<typeof meta>;

/** @summary A document with fixed typography and selection-based formatting. */
export const DocumentPage: Story = {
  args: {
    initialContent:
      "# A place for the next idea\n\nGood work starts with a little room to think. Use this document to shape a proposal, capture a decision, or work through a first draft.\n\n## Make it yours\n\nSelect a few words to **format them**. On a new line, type `/` to add a heading, a list, a quote, or a block of code.\n\n- Start with the problem you want to solve\n- Bring the team into the conversation\n- Leave room for what comes next\n\n> The best documents make the next step clear.\n\n## A small starting point\n\nNothing needs to be perfect on the first pass. Just start writing.",
  },
  play: async ({ canvas, args }) => {
    await expect(
      await canvas.findByRole("heading", { name: "A place for the next idea" })
    ).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveTextContent(/^Saved$/);
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** @summary Insert native blocks with the keyboard-driven slash menu. */
export const SlashCommands: Story = {
  args: { initialContent: "" },
  play: async ({ canvas, canvasElement, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(editor, "/");
    // Check a single slash after layout settles, as in a live Frame under Next StrictMode.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
    await waitFor(() =>
      expect(page.getByRole("menu", { name: "Add a block" })).toBeVisible()
    );
    await waitFor(() => {
      const bounds = page
        .getByRole("menu", { name: "Add a block" })
        .getBoundingClientRect();
      const viewport = canvasElement.ownerDocument.defaultView;
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom).toBeLessThanOrEqual(viewport?.innerHeight ?? 0);
    });
    await userEvent.keyboard("heading");
    const menu = await page.findByRole("menu", { name: "Add a block" });
    await expect(within(menu).getAllByRole("menuitem")).toHaveLength(3);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await userEvent.keyboard(
      "A section{Enter}/bullet{Enter}First idea{Enter}Second idea"
    );
    await expect(
      canvas.getByRole("heading", { name: "A section", level: 2 })
    ).toBeVisible();
    await expect(editor.querySelector("ul")).toHaveTextContent(
      "First ideaSecond idea"
    );
    await userEvent.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith(
        expect.stringContaining('"type":"bulletList"')
      )
    );
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.stringContaining('"level":2')
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(/^Saved$/);
    // Escape dismisses the menu without consuming or formatting the typed slash.
    await userEvent.keyboard("{Enter}{Enter}/");
    await waitFor(() =>
      expect(page.getByRole("menu", { name: "Add a block" })).toBeVisible()
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        page.queryByRole("menu", { name: "Add a block" })
      ).not.toBeInTheDocument()
    );
    await expect(editor).toHaveTextContent("/");
  },
};

/** @summary Prefill Markdown and serialize subsequent edits through the save callback. */
export const FromMarkdown: Story = {
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await expect(
      canvas.getByRole("heading", { name: "Team update" })
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Bold" })
    ).not.toBeInTheDocument();
    await expect(canvas.getByRole("status")).toHaveTextContent(/^Saved$/);
    await userEvent.clear(editor);
    await userEvent.type(editor, "An edited document");
    await userEvent.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent(/^Saved$/)
    );
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.stringContaining("An edited document")
    );
  },
};

/** @summary Format a selection with the floating toolbar and keyboard shortcuts. */
export const FormatSelection: Story = {
  args: { initialContent: "Select these words." },
  play: async ({ canvas, canvasElement, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.queryByRole("toolbar", { name: "Format selection" })
    ).not.toBeInTheDocument();
    await userEvent.click(editor);
    // Selecting DOM text exercises the editor's real selection observer and bubble positioning.
    const paragraph = editor.querySelector("p");
    if (!paragraph) {
      throw new Error("Expected a document paragraph");
    }
    const range = canvasElement.ownerDocument.createRange();
    range.selectNodeContents(paragraph);
    const selection = canvasElement.ownerDocument.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    canvasElement.ownerDocument.dispatchEvent(new Event("selectionchange"));
    const toolbar = await page.findByRole("toolbar", {
      name: "Format selection",
    });
    await userEvent.hover(
      within(toolbar).getByRole("button", { name: "Bold" })
    );
    await expect(await page.findByRole("tooltip")).toHaveTextContent("Bold");
    await userEvent.click(
      within(toolbar).getByRole("button", { name: "Bold" })
    );
    await expect(editor.querySelector("strong")).toHaveTextContent(
      "Select these words."
    );
    await userEvent.click(
      within(toolbar).getByRole("button", { name: "Italic" })
    );
    await expect(editor.querySelector("em")).toHaveTextContent(
      "Select these words."
    );
    const modifier = /Mac|iPhone|iPad/.test(navigator.platform)
      ? "Meta"
      : "Control";
    await userEvent.keyboard(`{${modifier}>}{Shift>}s{/Shift}{/${modifier}}`);
    await expect(editor.querySelector("s")).toHaveTextContent(
      "Select these words."
    );
    await expect(args.onSave).not.toHaveBeenCalled();
    await userEvent.keyboard("{Control>}s{/Control}");
    await waitFor(() => expect(args.onSave).toHaveBeenCalled());
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.stringContaining('"type":"bold"')
    );
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.stringContaining('"type":"italic"')
    );
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() =>
      expect(
        page.queryByRole("toolbar", { name: "Format selection" })
      ).not.toBeInTheDocument()
    );
  },
};

/** @summary Coalesce edits after three seconds of inactivity and skip unchanged content. */
export const Autosave: Story = {
  args: {
    initialContent:
      "# A quieter way to write\n\nYour changes save when you pause.",
  },
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.clear(editor);
    await userEvent.type(editor, "A first thought");
    await new Promise((resolve) => setTimeout(resolve, 1_800));
    await userEvent.keyboard(" becomes a complete sentence.");
    await new Promise((resolve) => setTimeout(resolve, 1_800));
    await expect(args.onSave).not.toHaveBeenCalled();
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Changes pending"
    );
    await waitFor(() => expect(args.onSave).toHaveBeenCalledTimes(1), {
      timeout: 2_500,
    });
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.stringContaining("A first thought becomes a complete sentence.")
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(/^Saved$/);
    await new Promise((resolve) => setTimeout(resolve, 3_200));
    await expect(args.onSave).toHaveBeenCalledTimes(1);
  },
};

/** @summary Keep failed edits and pause automatic retries until the user retries. */
export const SaveFailure: Story = {
  args: {
    onSave: fn(async () => ({
      ok: false as const,
      error: "A newer version was saved elsewhere. Your draft is preserved.",
    })),
  },
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.clear(editor);
    await userEvent.type(editor, "Keep these changes");
    await userEvent.keyboard("{Control>}s{/Control}");
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "A newer version"
    );
    await expect(editor).toHaveTextContent("Keep these changes");
    await expect(canvas.getByRole("status")).toHaveTextContent("Not saved");
    await expect(canvas.getByRole("button", { name: "Retry" })).toBeEnabled();
    await userEvent.type(editor, " and a further edit");
    await new Promise((resolve) => setTimeout(resolve, 3_200));
    await expect(args.onSave).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(args.onSave).toHaveBeenCalledTimes(2);
  },
};

function SlowSave() {
  const [finish, setFinish] = useState<(() => void) | null>(null);
  const [started, setStarted] = useState(0);
  function save(): Promise<DocumentSaveResult> {
    setStarted((count) => count + 1);
    return new Promise((resolve) =>
      setFinish(() => () => {
        resolve({ ok: true });
        setFinish(null);
      })
    );
  }
  return (
    <>
      <Document initialContent="Starting text" onSave={save} />
      <p>Saves started: {started}</p>
      {finish && (
        <button type="button" onClick={finish}>
          Complete pending save
        </button>
      )}
    </>
  );
}

/** @summary Preserve new edits while an earlier save is in flight. */
export const EditWhileSaving: Story = {
  render: () => <SlowSave />,
  play: async ({ canvas }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.clear(editor);
    await userEvent.type(editor, "First change");
    await userEvent.keyboard("{Control>}s{/Control}");
    await expect(canvas.getByRole("status")).toHaveTextContent("Saving…");
    await userEvent.type(editor, " plus another change");
    await new Promise((resolve) => setTimeout(resolve, 3_200));
    await expect(canvas.getByText("Saves started: 1")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Complete pending save" })
    );
    await expect(editor).toHaveTextContent("plus another change");
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Changes pending"
    );
    await waitFor(
      () => expect(canvas.getByText("Saves started: 2")).toBeVisible(),
      { timeout: 4_000 }
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Complete pending save" })
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(/^Saved$/);
  },
};

/** @summary Render content without editing or saving when requested by the caller. */
export const ReadOnly: Story = {
  args: { readOnly: true },
  play: async ({ canvas, args }) => {
    await expect(
      await canvas.findByRole("textbox", { name: "Document content" })
    ).toHaveAttribute("contenteditable", "false");
    await expect(
      canvas.queryByRole("button", { name: "Save" })
    ).not.toBeInTheDocument();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** @summary Reject invalid stored JSON without editing or replacing it. */
export const InvalidSavedContent: Story = {
  args: {
    initialContent: '{"type":"doc","content":[{"type":"unknownNode"}]}',
    contentType: "json",
  },
  play: async ({ canvas, args }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "saved content has not been changed"
    );
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** @summary The writing canvas in Dust's dark theme. */
export const DarkDocument: Story = {
  ...DocumentPage,
  globals: { theme: "dark" },
};

/** @summary A narrow side panel retains a readable title and comfortable gutters. */
export const NarrowDocument: Story = {
  ...DocumentPage,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 400, margin: "0 auto" }}>
        <Story />
      </div>
    ),
  ],
};

/** @summary Embed a read-only document in a custom Frame surface without a save function. */
export const EmbeddedDocument: Story = {
  args: {
    className: "mx-auto mt-6 max-w-xl rounded-xl border",
    onSave: undefined,
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("textbox", { name: "Document content" })
    ).toHaveAttribute("contenteditable", "false");
    await expect(canvas.getByRole("article")).toHaveStyle({
      maxWidth: "576px",
      marginTop: "24px",
      borderTopWidth: "1px",
    });
    await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
  },
};

/** @summary A shared viewer stays read-only even when generated code supplies an editable document. */
export const SharedDocument: Story = {
  args: { readOnly: false },
  render: (args) => (
    <VizContext.Provider value={READ_ONLY_VIEW}>
      <Document {...args} />
    </VizContext.Provider>
  ),
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await expect(editor).toHaveAttribute("contenteditable", "false");
    await userEvent.click(editor);
    await userEvent.keyboard("/{Control>}s{/Control}");
    await expect(editor).toHaveTextContent("Team update");
    await expect(canvas.queryByRole("menu")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("toolbar")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** @summary PDF rendering disables editing even if its host also enables editing. */
export const PdfDocument: Story = {
  ...SharedDocument,
  render: (args) => (
    <VizContext.Provider value={PDF_VIEW}>
      <Document {...args} />
    </VizContext.Provider>
  ),
};
