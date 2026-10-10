import {
  BLOCKS,
  EMBED_BLOCKS,
  getBlockQuery,
} from "@app/components/editor/document/blocks";
import { DOCUMENT_IMAGE_NODE_NAME } from "@app/components/editor/document/DocumentImage";
import type { DocumentEmbeddableFile } from "@app/components/editor/document/types";
import { cn, Icon } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Editor, JSONContent } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import type React from "react";
import type { ComponentType } from "react";
import { useId, useState } from "react";

interface DocumentBlockMenuItem {
  key: string;
  name: string;
  description: string;
  keywords: string;
  icon: ComponentType<{ className?: string }>;
  run: () => void;
}

const matches = (item: DocumentBlockMenuItem, search: string) =>
  `${item.name} ${item.keywords}`.toLowerCase().includes(search);

const embedContent = (file: DocumentEmbeddableFile): JSONContent => ({
  type: DOCUMENT_IMAGE_NODE_NAME,
  attrs: { src: file.path, alt: file.name, title: null },
});

/**
 * @cc [owner:tdraier,label:product] document-embed-blocks
 * The `/` menu MUST offer its embed blocks, such as Image, only when the host gives embeddable
 * files. Picking one MUST turn the menu into a search over the host's files of that kind, by name
 * or path, and picking a file MUST replace the `/` query with an embed of exactly that file's
 * path: for an image, an `image` node with the file name as alt text. Escape or removing the `/`
 * MUST leave the search without inserting anything.
 */
export const useDocumentBlockMenu = (
  editor: Editor | null,
  editable: boolean,
  embeddableFiles?: DocumentEmbeddableFile[]
) => {
  const [highlight, setHighlight] = useState({ queryKey: "", index: 0 });
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);
  const [picker, setPicker] = useState<{
    kind: DocumentEmbeddableFile["kind"];
    from: number;
  } | null>(null);
  const menuId = useId();
  const { t } = useLingui();

  const fileQuery = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor ? getBlockQuery(editor.state, { fileSearch: true }) : null,
  });
  const blockQuery = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? getBlockQuery(editor.state) : null),
  });
  const activePicker =
    picker && fileQuery && picker.from === fileQuery.from ? picker : null;
  if (picker && !activePicker) {
    setPicker(null);
  }
  const query = activePicker ? fileQuery : blockQuery;
  const search = query?.query.toLowerCase() ?? "";

  const reset = () => {
    setPicker(null);
    setDismissedQuery(null);
    setHighlight({ queryKey: "", index: 0 });
  };

  const blockItems: DocumentBlockMenuItem[] = [
    ...BLOCKS.map((block) => ({
      key: block.keywords,
      name: t(block.name),
      description: t(block.description),
      icon: block.icon,
      keywords: block.keywords,
      run: () => {
        if (editor && query) {
          block.apply(
            editor
              .chain()
              .focus()
              .deleteRange({ from: query.from, to: query.to })
          );
          reset();
        }
      },
    })),
    ...(embeddableFiles
      ? EMBED_BLOCKS.map((block) => ({
          key: block.kind,
          name: t(block.name),
          description: t(block.description),
          icon: block.icon,
          keywords: block.keywords,
          run: () => {
            if (editor && query) {
              // Keep the `/`, so what follows it searches the files.
              editor
                .chain()
                .focus()
                .deleteRange({ from: query.from + 1, to: query.to })
                .run();
              setPicker({ kind: block.kind, from: query.from });
              setHighlight({ queryKey: "", index: 0 });
            }
          },
        }))
      : []),
  ];

  const pickerBlock = activePicker
    ? EMBED_BLOCKS.find((block) => block.kind === activePicker.kind)
    : undefined;
  const fileItems: DocumentBlockMenuItem[] = pickerBlock
    ? (embeddableFiles ?? [])
        .filter((file) => file.kind === pickerBlock.kind)
        .map((file) => ({
          key: file.path,
          name: file.name,
          description: file.path,
          keywords: file.path,
          icon: pickerBlock.icon,
          run: () => {
            if (editor && query) {
              editor
                .chain()
                .focus()
                .insertContentAt(
                  { from: query.from, to: query.to },
                  embedContent(file)
                )
                .run();
              reset();
            }
          },
        }))
    : [];

  const items = (pickerBlock ? fileItems : blockItems).filter((item) =>
    matches(item, search)
  );
  const keyOf = (mode: string) =>
    query ? `${mode}:${query.from}:${query.query}` : "";
  const queryKey = keyOf(activePicker?.kind ?? "block");
  const activeIndex =
    highlight.queryKey === queryKey
      ? Math.min(highlight.index, items.length - 1)
      : 0;
  const show = editable && !!query && dismissedQuery !== queryKey;

  const insertBlock = (index: number) => items[index]?.run();

  const highlightBlock = (index: number) => setHighlight({ queryKey, index });

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!show) {
      if (dismissedQuery !== null) {
        setDismissedQuery(null);
      }

      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setPicker(null);
      // Leaving the search dismisses the blocks menu the remaining `/` would show.
      setDismissedQuery(keyOf("block"));
    } else if (
      items.length > 0 &&
      ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Enter") {
        insertBlock(activeIndex);
      } else {
        const index =
          (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
          items.length;
        highlightBlock(index);
        document
          .getElementById(`${menuId}-${index}`)
          ?.scrollIntoView({ block: "nearest" });
      }
    }
  };

  return {
    menuId,
    items,
    title: pickerBlock ? t(pickerBlock.pickerTitle) : null,
    isPicking: activePicker !== null,
    activeIndex,
    show,
    insertBlock,
    highlightBlock,
    onKeyDown,
  };
};

interface DocumentBlockMenuProps {
  editor: Editor;
  menu: ReturnType<typeof useDocumentBlockMenu>;
}

export const DocumentBlockMenu = ({ editor, menu }: DocumentBlockMenuProps) => {
  const { t } = useLingui();
  return (
    // Keep this plugin mounted while editing. StrictMode cleanup can detach a newly opened popup.
    <BubbleMenu
      editor={editor}
      pluginKey="document-block-menu"
      updateDelay={0}
      options={{ placement: "bottom-start", offset: 8 }}
      className="relative z-50 font-sans text-foreground antialiased print:hidden"
      shouldShow={({ editor, state }) =>
        editor.isEditable &&
        editor.isFocused &&
        getBlockQuery(state, { fileSearch: true }) !== null
      }
    >
      <div
        hidden={!menu.show}
        data-document-layer={menu.show ? "" : undefined}
        className={cn(
          "w-74 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-overlay-background p-1.5",
          "animate-in fade-in-0 slide-in-from-top-1 duration-150 motion-reduce:animate-none"
        )}
      >
        <div className="px-2.5 pt-1.5 pb-2 text-muted-foreground label-xs">
          {menu.title ?? <Trans>Add a paragraph</Trans>}
        </div>
        <div
          className="max-h-[min(22rem,55vh)] overflow-y-auto overscroll-contain [scrollbar-width:thin]"
          role="menu"
          aria-label={menu.title ?? t`Add a paragraph`}
        >
          {menu.items.map((block, index) => (
            <button
              key={block.key}
              id={`${menu.menuId}-${index}`}
              type="button"
              role="menuitem"
              aria-label={block.name}
              data-active={index === menu.activeIndex}
              onPointerMove={() => menu.highlightBlock(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => menu.insertBlock(index)}
              className={cn(
                "group flex min-h-13 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left data-[active=true]:bg-hover",
                "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              )}
            >
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground group-data-[active=true]:text-foreground"
              >
                <Icon visual={block.icon} size="sm" />
              </span>
              <span className="min-w-0">
                <span className="block truncate label-sm">{block.name}</span>
                <span className="mt-0.5 block truncate text-muted-foreground copy-xs">
                  {block.description}
                </span>
              </span>
              <span
                className="invisible ml-auto shrink-0 text-muted-foreground text-sm group-data-[active=true]:visible"
                aria-hidden="true"
              >
                ↵
              </span>
            </button>
          ))}
          {menu.items.length === 0 && (
            <div className="px-2.5 py-6 text-muted-foreground copy-sm">
              {menu.isPicking ? (
                <Trans>No matching files</Trans>
              ) : (
                <Trans>No matching paragraphs</Trans>
              )}
            </div>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between border-t border-border px-2.5 pt-2.5 pb-1 text-muted-foreground copy-xs">
          {[
            { keys: ["↑", "↓"], label: t`Navigate` },
            { keys: ["↵"], label: t`Insert` },
            { keys: ["esc"], label: t`Close` },
          ].map(({ keys, label }) => (
            <span key={label} className="inline-flex items-center gap-1">
              {keys.map((key) => (
                <kbd
                  key={key}
                  className="min-w-3.5 rounded border border-border px-0.5 text-center font-sans text-xs leading-tight"
                >
                  {key}
                </kbd>
              ))}
              {label}
            </span>
          ))}
        </div>
      </div>
    </BubbleMenu>
  );
};
