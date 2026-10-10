import { useDocumentBlockMenu } from "@app/components/editor/document/DocumentBlockMenu";
import { buildDocumentEditorExtensions } from "@app/components/editor/document/extensions";
import type { DocumentEmbeddableFile } from "@app/components/editor/document/types";
import type { MessageDescriptor } from "@lingui/core";
import { act, renderHook } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import type React from "react";
import { afterEach, describe, expect, it } from "vitest";

const FILES: DocumentEmbeddableFile[] = [
  { kind: "frame", path: "pod-p/Zoo/Zoo.tsx", name: "Zoo.tsx" },
  { kind: "frame", path: "pod-p/Clock/Clock.tsx", name: "Clock.tsx" },
  { kind: "image", path: "pod-p/charts/q3 chart.png", name: "q3 chart.png" },
];

const translate = (descriptor: MessageDescriptor) => descriptor.id ?? "";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function renderMenu(files?: DocumentEmbeddableFile[]) {
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
    expect(names(renderMenu().result.current.items)).not.toContain("Frame");
    editor?.destroy();
    expect(names(renderMenu(FILES).result.current.items)).toEqual(
      expect.arrayContaining(["Frame", "Image"])
    );
  });

  it("searches Frames after picking Frame, and embeds the chosen one's path", () => {
    const menu = renderMenu(FILES);
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

  it("embeds an image by its path, with its file name as alt text", () => {
    const menu = renderMenu(FILES);
    pick(menu, "Image");
    type("q3 ch");
    pick(menu, "q3 chart.png");

    expect(editor?.getMarkdown()).toBe(
      "Intro\n\n![q3 chart.png](<pod-p/charts/q3 chart.png>)"
    );
  });

  it("leaves the search without inserting on Escape", () => {
    const menu = renderMenu(FILES);
    pick(menu, "Frame");
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
