import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  expect,
  fn,
  mocked,
  spyOn,
  userEvent,
  waitFor,
  within,
} from "storybook/test";
import {
  Document,
  type DocumentProps,
  type DocumentSaveResult,
} from "@sparkle/components/Document";
import { useDocumentEditor } from "@sparkle/components/Document/useDocumentEditor";
import {
  Sheet,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@sparkle/components/Sheet";
import { EditorContent } from "@tiptap/react";

const SEED =
  "# Team update\n\nA short document, ready to edit.\n\n- Review the proposal\n- Share feedback";
const meta = {
  title: "Documents/Document",
  component: Document,
  decorators: [
    (Story) => (
      <React.StrictMode>
        <Story />
      </React.StrictMode>
    ),
  ],
  args: {
    initialContent: SEED,
    onSave: fn(async (): Promise<DocumentSaveResult> => ({ ok: true })),
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  render: (args) => <Document {...args} />,
} satisfies Meta<typeof Document>;
export default meta;
type Story = StoryObj<typeof meta>;

const HOST_RERENDER_INTERVAL_MS = 100;
const HOST_AUTOSAVE_DEBOUNCE_MS = 1_000;
const UNDO_GROUP_PAUSE_MS = 600;

/** @summary The writing surface with headings, lists, and a quote. */
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

/** @summary Heading links scroll within the document without opening a tab. */
export const HeadingLinks: Story = {
  args: {
    initialContent:
      "# Project brief\n\n[Résumé Café](#r%C3%A9sum%C3%A9-caf%C3%A9)\n\n## Résumé Café\n\nThe next steps for the team.",
  },
  beforeEach: () => {
    const open = spyOn(window, "open").mockReturnValue(null);
    return () => open.mockRestore();
  },
  play: async ({ canvas, args }) => {
    const heading = await canvas.findByRole("heading", { name: "Résumé Café" });
    const scroll = spyOn(heading, "scrollIntoView");
    const href = window.location.href;
    const link = canvas.getByRole("link", { name: "Résumé Café" });
    const bounds = link.getBoundingClientRect();

    try {
      await userEvent.pointer({
        keys: "[MouseLeft]",
        target: link,
        coords: {
          clientX: bounds.left + bounds.width / 2,
          clientY: bounds.top + bounds.height / 2,
        },
      });

      await expect(window.open).not.toHaveBeenCalled();
      await expect(scroll).toHaveBeenCalledWith({ block: "start" });
      await expect(window.location.href).toBe(href);
      await expect(args.onSave).not.toHaveBeenCalled();
    } finally {
      scroll.mockRestore();
    }
  },
};

/** @summary Read-only documents keep heading navigation inside the current document. */
export const ReadOnlyHeadingLinks: Story = {
  ...HeadingLinks,
  args: { ...HeadingLinks.args, readOnly: true },
};

/** @summary Insert blocks with slash commands and keyboard navigation. */
export const SlashCommands: Story = {
  args: { initialContent: "" },
  play: async ({ canvas, canvasElement, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(editor, "/");
    // Wait for StrictMode cleanup before checking popup visibility.
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

/** @summary Load Markdown and save edits as structured document JSON. */
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

/** @summary Formatting controls appear only for selected text. */
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
    // Use a DOM selection to exercise TipTap's selection observer.
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

/** @summary Formatting tooltips stay inside the enclosing sheet. */
export const InSheet: Story = {
  args: { initialContent: "Select these words." },
  render: (args) => (
    <Sheet>
      <SheetTrigger asChild>
        <button type="button" className="m-4 rounded border px-3 py-2">
          Open document
        </button>
      </SheetTrigger>
      <SheetContent size="xl">
        <SheetHeader hideButton>
          <SheetTitle>Document</SheetTitle>
          <SheetDescription>Edit and format your draft.</SheetDescription>
        </SheetHeader>
        <SheetContainer>
          <Document {...args} />
        </SheetContainer>
      </SheetContent>
    </Sheet>
  ),
  play: async ({ canvas, canvasElement, args }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Open document" })
    );

    const page = within(canvasElement.ownerDocument.body);
    const sheet = await page.findByRole("dialog", { name: "Document" });
    const editor = await within(sheet).findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.click(editor);

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

    const toolbar = await within(sheet).findByRole("toolbar", {
      name: "Format selection",
    });
    const bold = within(toolbar).getByRole("button", { name: "Bold" });
    await userEvent.hover(bold);
    await expect(await within(sheet).findByRole("tooltip")).toHaveTextContent(
      "Bold"
    );
    await userEvent.click(bold);
    await expect(editor.querySelector("strong")).toHaveTextContent(
      "Select these words."
    );
    await userEvent.keyboard("{Control>}s{/Control}");
    await waitFor(() => expect(args.onSave).toHaveBeenCalledTimes(1));
  },
};

/** @summary Configure the autosave delay and avoid requests for unchanged content. */
export const Autosave: Story = {
  args: {
    initialContent:
      "# A quieter way to write\n\nYour changes save when you pause.",
    autosaveDebounceMs: 1_000,
  },
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.clear(editor);
    await userEvent.type(editor, "A first thought");
    await new Promise((resolve) => setTimeout(resolve, 600));
    await userEvent.keyboard(" becomes a complete sentence.");
    await new Promise((resolve) => setTimeout(resolve, 600));
    await expect(args.onSave).not.toHaveBeenCalled();
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Changes pending"
    );
    await waitFor(() => expect(args.onSave).toHaveBeenCalledTimes(1), {
      timeout: 1_000,
    });
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.stringContaining("A first thought becomes a complete sentence.")
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(/^Saved$/);
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    await expect(args.onSave).toHaveBeenCalledTimes(1);
  },
};

const UpdatingParent = ({ onSave, onDirtyChange, ...props }: DocumentProps) => {
  const [revision, setRevision] = useState(0);
  const [savedRevision, setSavedRevision] = useState<number | null>(null);

  useEffect(() => {
    const interval = setInterval(
      () => setRevision((value) => value + 1),
      HOST_RERENDER_INTERVAL_MS
    );

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {/* Keep this callback inline to cover parent rerenders. */}
      <Document
        {...props}
        onDirtyChange={(dirty) => onDirtyChange?.(dirty)}
        onSave={
          onSave
            ? (content) => {
                setSavedRevision(revision);
                return onSave(content);
              }
            : undefined
        }
      />
      <p>Parent revision: {revision}</p>
      <output aria-label="Saved callback revision">{savedRevision}</output>
    </>
  );
};

/** @summary Parent updates keep the draft and autosave through the latest callback. */
export const AutosaveDuringParentUpdates: Story = {
  args: {
    initialContent: "A draft",
    autosaveDebounceMs: HOST_AUTOSAVE_DEBOUNCE_MS,
    onDirtyChange: fn(),
  },
  render: (args) => <UpdatingParent {...args} />,
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.type(editor, " with edits");
    await waitFor(() => expect(args.onSave).toHaveBeenCalledTimes(1), {
      timeout: HOST_AUTOSAVE_DEBOUNCE_MS * 2,
    });
    await expect(canvas.getByText(/^Saved$/)).toBeVisible();
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.stringContaining("with edits")
    );
    await expect(
      Number(canvas.getByLabelText("Saved callback revision").textContent)
    ).toBeGreaterThan(0);
    await expect(args.onDirtyChange).toHaveBeenCalledTimes(3);
    await expect(args.onDirtyChange).toHaveBeenNthCalledWith(1, false);
    await expect(args.onDirtyChange).toHaveBeenNthCalledWith(2, true);
    await expect(args.onDirtyChange).toHaveBeenNthCalledWith(3, false);
  },
};

type CommitChange = "none" | "callback" | "readOnly" | "removal" | "undo";

const SaveDuringCommit = ({
  initialContent,
  contentType = "markdown",
  autosaveDebounceMs = HOST_AUTOSAVE_DEBOUNCE_MS,
  onSave,
}: DocumentProps) => {
  const [change, setChange] = useState<CommitChange>("none");
  const [savedCallback, setSavedCallback] = useState("");
  const queuedSave = useRef<(() => Promise<DocumentSaveResult>) | null>(null);
  const { editor, save, dirty } = useDocumentEditor({
    initialContent,
    contentType,
    autosaveDebounceMs,
    readOnly: change === "readOnly",
    onSave:
      onSave && change !== "removal"
        ? (content) => {
            setSavedCallback(
              change === "callback" ? "Replacement" : "Original"
            );
            return onSave(content);
          }
        : undefined,
  });

  useLayoutEffect(() => {
    const pending = queuedSave.current;
    queuedSave.current = null;
    // Run the queued save after commit and before passive timer cleanup.
    void pending?.();
  }, [change]);

  const commitChange = (next: CommitChange) => {
    queuedSave.current = save;
    if (next === "undo") {
      editor?.commands.undo();
    }
    setChange(next);
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["callback", "Replace callback"],
            ["readOnly", "Revoke write access"],
            ["removal", "Remove persistence"],
            ["undo", "Undo to saved content"],
          ] as const
        ).map(([next, label]) => (
          <button
            key={next}
            type="button"
            className="rounded border px-3 py-2"
            onClick={() => commitChange(next)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="rounded border px-3 py-2"
          onClick={() => setChange("none")}
        >
          Restore write access
        </button>
      </div>
      <p>Draft: {dirty ? "Unsaved" : "Saved"}</p>
      <output aria-label="Persistence callback">{savedCallback}</output>
      <EditorContent editor={editor} />
    </div>
  );
};

/** @summary Queued saves respect committed callbacks, permissions, and undo. */
export const QueuedSaveDuringCommit: Story = {
  tags: ["!manifest"],
  args: { initialContent: "A saved draft", autosaveDebounceMs: 60_000 },
  render: (args) => <SaveDuringCommit {...args} />,
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.type(editor, " with edits");
    await userEvent.click(
      canvas.getByRole("button", { name: "Replace callback" })
    );
    await waitFor(() => expect(args.onSave).toHaveBeenCalledTimes(1));
    await expect(
      canvas.getByLabelText("Persistence callback")
    ).toHaveTextContent("Replacement");
    await expect(canvas.getByText("Draft: Saved")).toBeVisible();

    const savedText = editor.textContent;
    // Start a separate undo group for the next edit.
    await new Promise((resolve) => setTimeout(resolve, UNDO_GROUP_PAUSE_MS));
    await userEvent.type(editor, " plus a pending edit");
    const draft = editor.textContent;

    for (const action of ["Revoke write access", "Remove persistence"]) {
      await userEvent.click(canvas.getByRole("button", { name: action }));
      await expect(editor).toHaveAttribute("contenteditable", "false");
      await expect(editor.textContent).toBe(draft);
      await expect(canvas.getByText("Draft: Unsaved")).toBeVisible();
      await expect(args.onSave).toHaveBeenCalledTimes(1);
      await userEvent.click(
        canvas.getByRole("button", { name: "Restore write access" })
      );
      await expect(editor).toHaveAttribute("contenteditable", "true");
    }

    await userEvent.click(
      canvas.getByRole("button", { name: "Undo to saved content" })
    );
    await expect(editor.textContent).toBe(savedText);
    await expect(canvas.getByText("Draft: Saved")).toBeVisible();
    await expect(args.onSave).toHaveBeenCalledTimes(1);
  },
};

/** @summary Keep the draft after a failed save and allow an explicit retry. */
export const SaveFailure: Story = {
  args: {
    onSave: fn(
      async (): Promise<DocumentSaveResult> => ({
        ok: false,
        error: "A newer version was saved elsewhere. Your draft is preserved.",
      })
    ),
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
    if (!args.onSave) {
      throw new Error("Expected the story's persistence callback");
    }
    mocked(args.onSave).mockResolvedValue({ ok: true });
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(args.onSave).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent(/^Saved$/)
    );
    await expect(args.onSave).toHaveBeenLastCalledWith(
      expect.stringContaining("Keep these changes and a further edit")
    );
  },
};

/** @summary Undoing a failed save clears the error when the document matches its saved content. */
export const UndoAfterSaveFailure: Story = {
  args: {
    initialContent: "A saved document",
    onSave: fn(
      async (): Promise<DocumentSaveResult> => ({
        ok: false,
        error: "Persistence is unavailable.",
      })
    ),
  },
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    const savedText = editor.textContent;

    await userEvent.type(editor, " with unsaved edits");
    await userEvent.keyboard("{Control>}s{/Control}");
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Persistence is unavailable."
    );

    const modifier = /Mac|iPhone|iPad/.test(navigator.platform)
      ? "Meta"
      : "Control";
    await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`);

    await expect(editor.textContent).toBe(savedText);
    await expect(canvas.getByRole("status")).toHaveTextContent(/^Saved$/);
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Retry" })
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Control>}s{/Control}");
    await expect(args.onSave).toHaveBeenCalledTimes(1);
  },
};

const SlowSave = (props: DocumentProps) => {
  const [finish, setFinish] = useState<(() => void) | null>(null);
  const [started, setStarted] = useState(0);
  const save = (): Promise<DocumentSaveResult> => {
    setStarted((count) => count + 1);
    return new Promise((resolve) =>
      setFinish(() => () => {
        resolve({ ok: true });
        setFinish(null);
      })
    );
  };
  return (
    <>
      <Document {...props} onSave={save} />
      <p>Saves started: {started}</p>
      {finish && (
        <button type="button" onClick={finish}>
          Complete pending save
        </button>
      )}
    </>
  );
};

/** @summary Preserve new edits while a save is in flight. */
export const EditWhileSaving: Story = {
  args: {
    initialContent: "Starting text",
    onSave: undefined,
    onDirtyChange: fn(),
  },
  render: (args) => <SlowSave {...args} />,
  play: async ({ canvas, args }) => {
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
    await expect(args.onDirtyChange).toHaveBeenCalledTimes(2);
    await expect(args.onDirtyChange).toHaveBeenLastCalledWith(true);
    await waitFor(
      () => expect(canvas.getByText("Saves started: 2")).toBeVisible(),
      { timeout: 4_000 }
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Complete pending save" })
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(/^Saved$/);
    await expect(args.onDirtyChange).toHaveBeenCalledTimes(3);
    await expect(args.onDirtyChange).toHaveBeenLastCalledWith(false);
  },
};

/** @summary Disable editing and callbacks when the host requests read-only access. */
export const ReadOnly: Story = {
  args: { readOnly: true },
  play: async ({ canvas, args }) => {
    await expect(
      await canvas.findByRole("textbox", { name: "Document content" })
    ).toHaveAttribute("contenteditable", "false");
    const editor = canvas.getByRole("textbox");
    const initialText = editor.textContent;
    await userEvent.click(editor);
    await userEvent.keyboard("/{Control>}s{/Control}");
    await expect(editor.textContent).toBe(initialText);
    await expect(canvas.queryByRole("menu")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("toolbar")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

const ChangingPermissions = (props: DocumentProps) => {
  const [readOnly, setReadOnly] = useState(false);
  const [hasPersistence, setHasPersistence] = useState(true);
  return (
    <>
      <div className="flex gap-4 border-b p-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={readOnly}
            onChange={(event) => setReadOnly(event.target.checked)}
          />
          Read only
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={hasPersistence}
            onChange={(event) => setHasPersistence(event.target.checked)}
          />
          Persistence available
        </label>
      </div>
      <Document
        {...props}
        readOnly={readOnly}
        onSave={hasPersistence ? props.onSave : undefined}
      />
    </>
  );
};

/** @summary Permission and persistence changes update editability without replacing the draft. */
export const PermissionChanges: Story = {
  args: {
    initialContent: "A draft",
    autosaveDebounceMs: HOST_AUTOSAVE_DEBOUNCE_MS,
  },
  render: (args) => <ChangingPermissions {...args} />,
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.type(editor, " with edits");
    const draft = editor.textContent;
    await userEvent.click(canvas.getByRole("checkbox", { name: "Read only" }));
    await expect(editor).toHaveAttribute("contenteditable", "false");
    await userEvent.click(editor);
    await userEvent.keyboard(" must not appear{Control>}s{/Control}");
    await expect(editor.textContent).toBe(draft);
    await new Promise((resolve) =>
      setTimeout(resolve, HOST_AUTOSAVE_DEBOUNCE_MS * 1.5)
    );
    await expect(args.onSave).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("checkbox", { name: "Read only" }));
    await expect(editor).toHaveAttribute("contenteditable", "true");
    await expect(editor.textContent).toBe(draft);
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Persistence available" })
    );
    await expect(editor).toHaveAttribute("contenteditable", "false");
    await new Promise((resolve) =>
      setTimeout(resolve, HOST_AUTOSAVE_DEBOUNCE_MS * 1.5)
    );
    await expect(args.onSave).not.toHaveBeenCalled();
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Persistence available" })
    );
    await expect(editor).toHaveAttribute("contenteditable", "true");
    await expect(editor.textContent).toBe(draft);
    await userEvent.click(editor);
    await userEvent.keyboard("{Control>}s{/Control}");
    await waitFor(() => expect(args.onSave).toHaveBeenCalledTimes(1));
    await expect(canvas.getByRole("status")).toHaveTextContent(/^Saved$/);
  },
};

/** @summary Show an error without discarding invalid stored content. */
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
      <div className="mx-auto max-w-100">
        <Story />
      </div>
    ),
  ],
};

/** @summary Style the outer container and render content without a save callback. */
export const CustomContainer: Story = {
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

/** @summary Use the available width for document editing in a wide panel. */
export const FullWidth: Story = {
  args: { fullWidth: true },
};
