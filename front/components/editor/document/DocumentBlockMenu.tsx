import {
  BLOCKS,
  EMBEDS,
  getBlockQuery,
} from "@app/components/editor/document/blocks";
import { DOCUMENT_FRAME_NODE_NAME } from "@app/components/editor/document/DocumentFrame";
import { DOCUMENT_IMAGE_NODE_NAME } from "@app/components/editor/document/DocumentImage";
import type {
  DocumentEmbeddableFile,
  DocumentEmbeddableFiles,
} from "@app/components/editor/document/types";
import { cn, Icon } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Editor, JSONContent } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import type { BubbleMenuProps } from "@tiptap/react/menus";
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

const embedContent = (file: DocumentEmbeddableFile): JSONContent =>
  file.kind === "frame"
    ? { type: DOCUMENT_FRAME_NODE_NAME, attrs: { path: file.path } }
    : {
        type: DOCUMENT_IMAGE_NODE_NAME,
        attrs: { src: file.path, alt: file.name, title: null },
      };

type BlockQuery = NonNullable<ReturnType<typeof getBlockQuery>>;
type AtQuery = (
  apply: (editor: Editor, query: BlockQuery) => void
) => () => void;
type Translate = ReturnType<typeof useLingui>["t"];
type DocumentBlockMenuKeyEvent = Pick<
  React.KeyboardEvent<HTMLElement>,
  "key" | "preventDefault" | "stopPropagation"
>;

const NAVIGATION_KEYS = new Set(["ArrowDown", "ArrowUp", "Enter"]);

const stepIndex = (index: number, key: string, length: number) =>
  (index + (key === "ArrowDown" ? 1 : -1) + length) % length;

const buildMenuItems = ({
  t,
  atQuery,
  embeddableFiles,
  onInserted,
  onPick,
}: {
  t: Translate;
  atQuery: AtQuery;
  embeddableFiles: DocumentEmbeddableFiles | undefined;
  onInserted: () => void;
  onPick: (kind: DocumentEmbeddableFile["kind"], from: number) => void;
}): DocumentBlockMenuItem[] => [
  ...BLOCKS.map((block) => ({
    key: block.keywords,
    name: t(block.name),
    description: t(block.description),
    icon: block.icon,
    keywords: block.keywords,
    run: atQuery((editor, query) => {
      block.apply(
        editor.chain().focus().deleteRange({ from: query.from, to: query.to })
      );
      onInserted();
    }),
  })),
  ...(embeddableFiles ? EMBEDS : []).map((embed) => ({
    key: embed.kind,
    name: t(embed.name),
    description: t(embed.description),
    icon: embed.icon,
    keywords: embed.keywords,
    run: atQuery((editor, query) => {
      // Keep the `/`, so what follows it searches the files.
      editor
        .chain()
        .focus()
        .deleteRange({ from: query.from + 1, to: query.to })
        .run();
      onPick(embed.kind, query.from);
    }),
  })),
];

const buildFileItems = ({
  embed,
  files,
  atQuery,
  onInserted,
}: {
  embed: (typeof EMBEDS)[number];
  files: DocumentEmbeddableFile[];
  atQuery: AtQuery;
  onInserted: () => void;
}): DocumentBlockMenuItem[] =>
  files
    .filter((file) => file.kind === embed.kind)
    .map((file) => ({
      key: file.path,
      name: file.name,
      description: file.path,
      keywords: file.path,
      icon: embed.icon,
      run: atQuery((editor, query) => {
        editor
          .chain()
          .focus()
          .insertContentAt(
            { from: query.from, to: query.to },
            embedContent(file)
          )
          .run();
        onInserted();
      }),
    }));

/**
 * @cc [owner:tdraier,label:product] document-slash-embeds
 * The `/` menu MUST offer its embed entries, Frame and Image, only when the host gives embeddable
 * files, and MUST ask the host to load them only once one is picked. Picking one MUST turn the menu
 * into a search over the host's files of that kind, by name or path, showing that they load while
 * none has arrived, and picking a file MUST replace the `/` query with an embed of exactly that file's
 * path: for a Frame, a `frameEmbed` node; for an image, an `image` node with the file name as alt
 * text. Escape or removing the `/` MUST leave the search without inserting anything.
 */
export const useDocumentBlockMenu = (
  editor: Editor | null,
  editable: boolean,
  embeddableFiles?: DocumentEmbeddableFiles
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
  const atQuery: AtQuery = (apply) => () => {
    if (editor && query) {
      apply(editor, query);
    }
  };

  const menuItems = buildMenuItems({
    t,
    atQuery,
    embeddableFiles,
    onInserted: reset,
    onPick: (kind, from) => {
      embeddableFiles?.load();
      setPicker({ kind, from });
      setHighlight({ queryKey: "", index: 0 });
    },
  });
  const pickerEmbed = activePicker
    ? EMBEDS.find((embed) => embed.kind === activePicker.kind)
    : undefined;
  const fileItems = pickerEmbed
    ? buildFileItems({
        embed: pickerEmbed,
        files: embeddableFiles?.files ?? [],
        atQuery,
        onInserted: reset,
      })
    : [];

  const items = (pickerEmbed ? fileItems : menuItems).filter((item) =>
    matches(item, search)
  );
  const keyOf = (mode: string) =>
    query ? `${mode}:${query.from}:${query.query}` : "";
  const queryKey = keyOf(activePicker?.kind ?? "menu");
  const activeIndex =
    highlight.queryKey === queryKey
      ? Math.min(highlight.index, items.length - 1)
      : 0;
  const show = editable && !!query && dismissedQuery !== queryKey;

  const insertBlock = (index: number) => items[index]?.run();

  const highlightBlock = (index: number) => setHighlight({ queryKey, index });

  const onKeyDown = (event: DocumentBlockMenuKeyEvent) => {
    if (!show) {
      setDismissedQuery(null);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setPicker(null);
      // Leaving the search dismisses the menu the remaining `/` would show.
      setDismissedQuery(keyOf("menu"));
      return;
    }
    if (items.length === 0 || !NAVIGATION_KEYS.has(event.key)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Enter") {
      insertBlock(activeIndex);
      return;
    }
    const index = stepIndex(activeIndex, event.key, items.length);
    highlightBlock(index);
    document
      .getElementById(`${menuId}-${index}`)
      ?.scrollIntoView({ block: "nearest" });
  };

  return {
    menuId,
    items,
    title: pickerEmbed ? t(pickerEmbed.pickerTitle) : null,
    isPicking: activePicker !== null,
    isLoadingFiles: !!pickerEmbed && !!embeddableFiles?.isLoading,
    activeIndex,
    show,
    insertBlock,
    highlightBlock,
    onKeyDown,
  };
};

// BubbleMenu reapplies its options to the editor whenever `shouldShow` or `options` changes
// identity, so both stay stable across renders.
const BLOCK_MENU_OPTIONS: BubbleMenuProps["options"] = {
  placement: "bottom-start",
  offset: 8,
};

const showBlockMenu: NonNullable<BubbleMenuProps["shouldShow"]> = ({
  editor,
  state,
}) =>
  editor.isEditable &&
  editor.isFocused &&
  getBlockQuery(state, { fileSearch: true }) !== null;

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
      options={BLOCK_MENU_OPTIONS}
      className="relative z-50 font-sans text-foreground antialiased print:hidden"
      shouldShow={showBlockMenu}
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
              {menu.isLoadingFiles ? (
                <Trans>Loading files…</Trans>
              ) : menu.isPicking ? (
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
