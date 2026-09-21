import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { VizContext } from "@viz/app/components/VizContext";
import "@viz/app/styles/globals.css";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { Document, type DocumentProps, type DocumentSaveResult } from "./index";

const EDITABLE_VIEW = { isEditable: true, isPdfMode: false, editText: null };
const SEED =
  "# Team update\n\nA short document, ready to edit.\n\n- Review the proposal\n- Share feedback";

afterEach(cleanup);

function renderDocument(
  props: Partial<DocumentProps> = {},
  view = EDITABLE_VIEW
) {
  const onSave = vi
    .fn<NonNullable<DocumentProps["onSave"]>>()
    .mockResolvedValue({ ok: true });
  return {
    onSave,
    ...render(<Document initialContent={SEED} onSave={onSave} {...props} />, {
      wrapper: ({ children }) => (
        <StrictMode>
          <VizContext.Provider value={view}>{children}</VizContext.Provider>
        </StrictMode>
      ),
    }),
  };
}

describe("Document", () => {
  it("renders Markdown and reopens edits serialized by the save callback", async () => {
    const { onSave, unmount } = renderDocument();
    const editor = await screen.findByRole("textbox", {
      name: "Document content",
    });
    expect(screen.getByRole("heading", { name: "Team update" })).toBeVisible();
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/^Saved$/);
    expect(onSave).not.toHaveBeenCalled();

    await userEvent.fill(editor, "An edited document");
    await userEvent.keyboard("{Control>}s{/Control}");
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.stringContaining("An edited document")
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/^Saved$/)
    );

    unmount();
    renderDocument({
      initialContent: onSave.mock.calls[0][0],
      contentType: "json",
    });
    expect(await screen.findByRole("textbox")).toHaveTextContent(
      "An edited document"
    );
  });

  it("opens the slash menu on the first slash and inserts blocks using the keyboard", async () => {
    const { onSave } = renderDocument({ initialContent: "" });
    const editor = await screen.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.type(editor, "/");
    // Let StrictMode and floating menu layout settle before checking the first slash.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
    await waitFor(() => {
      const menu = screen.getByRole("menu", { name: "Add a block" });
      expect(menu).toBeVisible();
      const bounds = menu.getBoundingClientRect();
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);
    });
    await userEvent.keyboard("heading");
    expect(
      within(screen.getByRole("menu")).getAllByRole("menuitem")
    ).toHaveLength(3);
    await userEvent.keyboard(
      "{ArrowDown}{Enter}A section{Enter}/bullet{Enter}First idea{Enter}Second idea"
    );
    expect(
      screen.getByRole("heading", { name: "A section", level: 2 })
    ).toBeVisible();
    expect(editor.querySelector("ul")).toHaveTextContent(
      "First ideaSecond idea"
    );
    await userEvent.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.stringContaining('"type":"bulletList"')
      )
    );
    expect(onSave).toHaveBeenCalledWith(expect.stringContaining('"level":2'));

    await userEvent.keyboard("{Enter}{Enter}/");
    await waitFor(() =>
      expect(screen.getByRole("menu", { name: "Add a block" })).toBeVisible()
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    );
    expect(editor).toHaveTextContent("/");
  });

  it("shows formatting only for a selection and preserves formatting shortcuts", async () => {
    const { onSave } = renderDocument({
      initialContent: "Select these words.",
    });
    const editor = await screen.findByRole("textbox", {
      name: "Document content",
    });
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    await userEvent.click(editor);
    const paragraph = editor.querySelector("p");
    if (!paragraph) {
      throw new Error("Expected a document paragraph");
    }
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    const toolbar = await screen.findByRole("toolbar", {
      name: "Format selection",
    });
    await userEvent.hover(
      within(toolbar).getByRole("button", { name: "Bold" })
    );
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Bold");
    await userEvent.click(
      within(toolbar).getByRole("button", { name: "Bold" })
    );
    expect(editor.querySelector("strong")).toHaveTextContent(
      "Select these words."
    );
    await userEvent.click(
      within(toolbar).getByRole("button", { name: "Italic" })
    );
    expect(editor.querySelector("em")).toHaveTextContent("Select these words.");
    const modifier = /Mac|iPhone|iPad/.test(navigator.platform)
      ? "Meta"
      : "Control";
    await userEvent.keyboard(`{${modifier}>}{Shift>}s{/Shift}{/${modifier}}`);
    expect(editor.querySelector("s")).toHaveTextContent("Select these words.");
    expect(onSave).not.toHaveBeenCalled();
    await userEvent.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.stringContaining('"type":"bold"')
      )
    );
    expect(onSave).toHaveBeenCalledWith(
      expect.stringContaining('"type":"italic"')
    );
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() =>
      expect(screen.queryByRole("toolbar")).not.toBeInTheDocument()
    );
  });

  it("autosaves after three idle seconds and skips unchanged content", async () => {
    const { onSave } = renderDocument();
    const editor = await screen.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.fill(editor, "A first thought");
    await new Promise((resolve) => setTimeout(resolve, 1_800));
    await userEvent.keyboard(" becomes a complete sentence.");
    await new Promise((resolve) => setTimeout(resolve, 1_800));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Changes pending");
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1), {
      timeout: 2_500,
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.stringContaining("A first thought becomes a complete sentence.")
    );
    expect(screen.getByRole("status")).toHaveTextContent(/^Saved$/);
    await new Promise((resolve) => setTimeout(resolve, 3_200));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("preserves a failed draft and suspends autosave until an explicit retry", async () => {
    const onSave = vi
      .fn<NonNullable<DocumentProps["onSave"]>>()
      .mockResolvedValueOnce({
        ok: false,
        error: "A newer version was saved elsewhere. Your draft is preserved.",
      })
      .mockResolvedValue({ ok: true });
    renderDocument({ onSave });
    const editor = await screen.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.fill(editor, "Keep these changes");
    await userEvent.keyboard("{Control>}s{/Control}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A newer version"
    );
    expect(editor).toHaveTextContent("Keep these changes");
    expect(screen.getByRole("status")).toHaveTextContent("Not saved");
    await userEvent.keyboard(" and a further edit");
    await new Promise((resolve) => setTimeout(resolve, 3_200));
    expect(onSave).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/^Saved$/)
    );
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith(
      expect.stringContaining("Keep these changes and a further edit")
    );
  });

  it("keeps edits made during a save dirty and never overlaps requests", async () => {
    const pending = Promise.withResolvers<DocumentSaveResult>();
    const onSave = vi
      .fn<NonNullable<DocumentProps["onSave"]>>()
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValue({ ok: true });
    renderDocument({ onSave });
    const editor = await screen.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.fill(editor, "First change");
    await userEvent.keyboard("{Control>}s{/Control}");
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");
    await userEvent.keyboard(" plus another change");
    await userEvent.keyboard("{Control>}s{/Control}");
    await new Promise((resolve) => setTimeout(resolve, 3_200));
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ ok: true }));
    expect(editor).toHaveTextContent("First change plus another change");
    expect(screen.getByRole("status")).toHaveTextContent("Changes pending");
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2), {
      timeout: 4_000,
    });
    expect(onSave).toHaveBeenLastCalledWith(
      expect.stringContaining("First change plus another change")
    );
    expect(screen.getByRole("status")).toHaveTextContent(/^Saved$/);
  });

  it("keeps the current draft when its initial-content prop changes", async () => {
    const { onSave, rerender } = renderDocument();
    const editor = await screen.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.fill(editor, "My unsaved draft");
    rerender(
      <Document initialContent="# A newer server snapshot" onSave={onSave} />
    );
    expect(editor).toHaveTextContent("My unsaved draft");
    expect(editor).not.toHaveTextContent("A newer server snapshot");
    expect(onSave).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "explicit read-only prop",
      props: { readOnly: true },
      view: EDITABLE_VIEW,
    },
    {
      name: "shared view",
      props: { readOnly: false },
      view: { ...EDITABLE_VIEW, isEditable: false },
    },
    {
      name: "PDF view",
      props: { readOnly: false },
      view: { ...EDITABLE_VIEW, isPdfMode: true },
    },
  ])("disables editing and saving for $name", async ({ props, view }) => {
    const { onSave } = renderDocument(props, view);
    const editor = await screen.findByRole("textbox", {
      name: "Document content",
    });
    expect(editor).toHaveAttribute("contenteditable", "false");
    const initialText = editor.textContent;
    await userEvent.click(editor);
    await userEvent.keyboard("/{Control>}s{/Control}");
    expect(editor.textContent).toBe(initialText);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("renders without a save callback and applies className to the outer container", async () => {
    renderDocument({
      onSave: undefined,
      className: "mx-auto mt-6 max-w-xl rounded-xl border",
    });
    expect(await screen.findByRole("textbox")).toHaveAttribute(
      "contenteditable",
      "false"
    );
    expect(screen.getByRole("article")).toHaveStyle({
      maxWidth: "576px",
      marginTop: "24px",
      borderTopWidth: "1px",
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it.each([
    "not JSON",
    '{"type":"doc","content":[{"type":"unknownNode"}]}',
  ])("rejects invalid stored content without editing or saving: %s", async (initialContent) => {
    const { onSave } = renderDocument({ initialContent, contentType: "json" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "saved content has not been changed"
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
