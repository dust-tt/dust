import { useDocumentBlockMenu } from "@app/components/editor/document/DocumentBlockMenu";
import { buildDocumentEditorExtensions } from "@app/components/editor/document/extensions";
import type {
  DocumentEmbeddableFile,
  DocumentEmbeddableFiles,
} from "@app/components/editor/document/types";
import type { MessageDescriptor } from "@lingui/core";
import { act, renderHook } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const FILES: DocumentEmbeddableFile[] = [
  { kind: "image", path: "pod-p/charts/q3 chart.png", name: "q3 chart.png" },
  { kind: "image", path: "pod-p/logo.png", name: "logo.png" },
];

const translate = (descriptor: MessageDescriptor) => descriptor.id ?? "";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

const embeddable = (
  overrides: Partial<DocumentEmbeddableFiles> = {}
): DocumentEmbeddableFiles => ({
  files: FILES,
  isLoading: false,
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
  it("offers Image only with embeddable files", () => {
    expect(names(renderMenu().result.current.items)).not.toContain("Image");
    editor?.destroy();
    expect(names(renderMenu(embeddable()).result.current.items)).toContain(
      "Image"
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
      "logo.png",
    ]);

    type("charts/");
    expect(names(menu.result.current.items)).toEqual(["q3 chart.png"]);
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
      } as React.KeyboardEvent<HTMLElement>)
    );

    expect(menu.result.current.isPicking).toBe(false);
    expect(menu.result.current.show).toBe(false);
    expect(editor?.getMarkdown()).toBe("Intro\n\n/");
  });
});
