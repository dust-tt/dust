import { BLOCKS, getBlockQuery } from "@app/components/editor/document/blocks";
import { cn, Icon } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import type React from "react";
import { useId, useState } from "react";

export const useDocumentBlockMenu = (
  editor: Editor | null,
  editable: boolean
) => {
  const [highlight, setHighlight] = useState({ queryKey: "", index: 0 });
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);
  const menuId = useId();
  const { t } = useLingui();

  const blockQuery = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? getBlockQuery(editor.state) : null),
  });

  const queryKey = blockQuery ? `${blockQuery.from}:${blockQuery.query}` : "";
  const blocks = BLOCKS.map((block) => ({
    ...block,
    name: t(block.name),
    description: t(block.description),
  })).filter((block) =>
    `${block.name} ${block.keywords}`
      .toLowerCase()
      .includes(blockQuery?.query.toLowerCase() ?? "")
  );
  const activeIndex =
    highlight.queryKey === queryKey
      ? Math.min(highlight.index, blocks.length - 1)
      : 0;
  const show = editable && !!blockQuery && dismissedQuery !== queryKey;

  const insertBlock = (index: number) => {
    const block = blocks[index];

    if (editor && blockQuery && block) {
      block.apply(
        editor
          .chain()
          .focus()
          .deleteRange({ from: blockQuery.from, to: blockQuery.to })
      );
      setDismissedQuery(null);
      setHighlight({ queryKey: "", index: 0 });
    }
  };

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
      setDismissedQuery(queryKey);
    } else if (
      blocks.length > 0 &&
      ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Enter") {
        insertBlock(activeIndex);
      } else {
        const index =
          (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + blocks.length) %
          blocks.length;
        highlightBlock(index);
        document
          .getElementById(`${menuId}-${index}`)
          ?.scrollIntoView({ block: "nearest" });
      }
    }
  };

  return {
    menuId,
    blocks,
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
        editor.isEditable && editor.isFocused && getBlockQuery(state) !== null
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
          <Trans>Add a paragraph</Trans>
        </div>
        <div
          className="max-h-[min(22rem,55vh)] overflow-y-auto overscroll-contain [scrollbar-width:thin]"
          role="menu"
          aria-label={t`Add a paragraph`}
        >
          {menu.blocks.map((block, index) => (
            <button
              key={block.name}
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
              <span>
                <span className="block label-sm">{block.name}</span>
                <span className="mt-0.5 block text-muted-foreground copy-xs">
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
          {menu.blocks.length === 0 && (
            <div className="px-2.5 py-6 text-muted-foreground copy-sm">
              <Trans>No matching paragraphs</Trans>
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
