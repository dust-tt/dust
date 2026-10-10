import { useDocumentBlockMenu } from "@app/components/editor/document/DocumentBlockMenu";
import { buildDocumentEditorExtensions } from "@app/components/editor/document/extensions";
import type { DocumentEmbeddableFiles } from "@app/components/editor/document/types";
import { DocumentEmbeddableFileFactory } from "@app/tests/utils/DocumentEmbeddableFileFactory";
import type { MessageDescriptor } from "@lingui/core";
import { act, renderHook } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";

const FILES = [
  DocumentEmbeddableFileFactory.frame("pod-p/Zoo/Zoo.tsx"),
  DocumentEmbeddableFileFactory.frame("pod-p/Clock/Clock.tsx"),
  DocumentEmbeddableFileFactory.image("pod-p/charts/q3 chart.png"),
  DocumentEmbeddableFileFactory.image("pod-p/img_01.png", "Company logo"),
];

const translate = (descriptor: MessageDescriptor) => descriptor.id ?? "";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

const embeddable = (
  overrides: Partial<DocumentEmbeddableFiles> = {}
): DocumentEmbeddableFiles =>
  DocumentEmbeddableFileFactory.files({
    files: FILES,
    load: vi.fn(),
    ...overrides,
  });

function renderMenu(files?: DocumentEmbeddableFiles) {
  editor = new Editor({
    extensions: buildDocumentEditorExtensions(translate, {
      resolveImageSource: () => null,
    }),
    content: "<p>Intro</p><p>/</p>",
  });
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  const current = editor;
  return renderHook(() => useDocumentBlockMenu(current, true, files));
}

const names = (items: { name: string }[]) => items.map((item) => item.name);

const pick = (menu: ReturnType<typeof renderMenu>, name: string): void => {
  const index = names(menu.result.current.items).indexOf(name);
  expect(index).toBeGreaterThanOrEqual(0);
  act(() => menu.result.current.insertBlock(index));
};

const type = (text: string) =>
  act(() => {
    editor?.commands.insertContent(text);
  });

describe("useDocumentBlockMenu embeds", () => {
  it("offers Frame and Image only with embeddable files", () => {
    const withoutFiles = names(renderMenu().result.current.items);
    expect(withoutFiles).not.toContain("Frame");
    expect(withoutFiles).not.toContain("Image");
    editor?.destroy();
    expect(names(renderMenu(embeddable()).result.current.items)).toEqual(
      expect.arrayContaining(["Frame", "Image"])
    );
  });

  it("searches Frames after picking Frame, and embeds the chosen one's path", () => {
    const menu = renderMenu(embeddable());
    type("fra");
    pick(menu, "Frame");

    expect(menu.result.current.isPicking).toBe(true);
    expect(names(menu.result.current.items)).toEqual(["Zoo.tsx", "Clock.tsx"]);

    type("clo");
    expect(names(menu.result.current.items)).toEqual(["Clock.tsx"]);
    pick(menu, "Clock.tsx");

    expect(menu.result.current.isPicking).toBe(false);
    expect(editor?.getMarkdown().trimEnd()).toBe(
      'Intro\n\n::frame{path="pod-p/Clock/Clock.tsx"}'
    );
  });

  it("loads the files only once Image is picked, and says so while they load", () => {
    const files = embeddable({ files: [], isLoading: true });
    const menu = renderMenu(files);
    expect(files.load).not.toHaveBeenCalled();

    pick(menu, "Image");

    expect(files.load).toHaveBeenCalledOnce();
    expect(menu.result.current.isLoadingFiles).toBe(true);
  });

  it("searches images after picking Image, by name or path", () => {
    const menu = renderMenu(embeddable());
    type("im");
    pick(menu, "Image");

    expect(menu.result.current.isPicking).toBe(true);
    expect(names(menu.result.current.items)).toEqual([
      "q3 chart.png",
      "Company logo",
    ]);

    type("charts/");
    expect(names(menu.result.current.items)).toEqual(["q3 chart.png"]);

    act(() => {
      editor?.commands.deleteRange({
        from: editor.state.selection.from - "charts/".length,
        to: editor.state.selection.from,
      });
    });
    type("company");
    expect(names(menu.result.current.items)).toEqual(["Company logo"]);
  });

  it("embeds an image by its path, with its file name as alt text", () => {
    const menu = renderMenu(embeddable());
    pick(menu, "Image");
    type("q3 ch");
    pick(menu, "q3 chart.png");

    expect(editor?.getMarkdown()).toBe(
      "Intro\n\n![q3 chart.png](<pod-p/charts/q3 chart.png>)"
    );
  });

  it("leaves the search without inserting on Escape", () => {
    const menu = renderMenu(embeddable());
    pick(menu, "Image");
    act(() =>
      menu.result.current.onKeyDown({
        key: "Escape",
        preventDefault: () => {},
        stopPropagation: () => {},
      })
    );

    expect(menu.result.current.isPicking).toBe(false);
    expect(menu.result.current.show).toBe(false);
    expect(editor?.getMarkdown()).toBe("Intro\n\n/");
  });
});
