import { documentCommentsPluginKey } from "@app/components/editor/document/DocumentComments";
import {
  Bold01,
  Code01,
  cn,
  Icon,
  Italic01,
  MessagePlusCircle,
  Separator,
  Tooltip,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Editor } from "@tiptap/core";
import { isTextSelection } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";

interface DocumentSelectionToolbarProps {
  editor: Editor;
  mountPortalContainer?: HTMLElement;
  /** Shows the Comment action after the formatting controls. */
  onComment?: () => void;
}

const TOOLBAR_BUTTON_CLASS = cn(
  "inline-flex h-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-hover hover:text-foreground motion-reduce:transition-none",
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
);

/**
 * @cc [owner:flvndvd;tdraier,label:product] document-comment-cta
 * The Comment action MUST appear only when onComment is provided and the selection can
 * start a draft. The toolbar MUST stay hidden while a comment draft is pending.
 */
export const DocumentSelectionToolbar = ({
  editor,
  mountPortalContainer,
  onComment,
}: DocumentSelectionToolbarProps) => {
  const { t } = useLingui();
  const selection = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      strike: editor.isActive("strike"),
      code: editor.isActive("code"),
      canComment: editor.can().startCommentDraft(),
    }),
  });
  const isApple =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform);
  const modifier = isApple ? "Cmd" : "Ctrl";

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top" }}
      className="relative z-50 font-sans text-foreground antialiased print:hidden"
      shouldShow={({ editor, view, state, from, to }) =>
        editor.isEditable &&
        isTextSelection(state.selection) &&
        !state.selection.empty &&
        state.doc.textBetween(from, to).length > 0 &&
        !documentCommentsPluginKey.getState(state)?.draft &&
        (editor.isFocused ||
          // The view's own document: TipTap fires this from a timer that can outlive the page and
          // the editor, whose `view` getter throws once destroyed.
          !!view.dom.ownerDocument.activeElement?.closest(
            "[data-document-selection]"
          ))
      }
    >
      <div
        role="toolbar"
        aria-label={t`Format selection`}
        data-document-selection=""
        className="flex items-center gap-0.5 rounded-xl border border-border bg-overlay-background p-1"
      >
        {[
          {
            key: "bold",
            label: t`Bold`,
            shortcut: `${modifier}+B`,
            icon: Bold01,
            active: selection.bold,
            run: () => editor.chain().focus().toggleBold().run(),
          },
          {
            key: "italic",
            label: t`Italic`,
            shortcut: `${modifier}+I`,
            icon: Italic01,
            active: selection.italic,
            run: () => editor.chain().focus().toggleItalic().run(),
          },
          {
            key: "strike",
            label: t`Strikethrough`,
            shortcut: `${modifier}+Shift+S`,
            icon: undefined,
            active: selection.strike,
            run: () => editor.chain().focus().toggleStrike().run(),
          },
          {
            key: "code",
            label: t`Inline code`,
            shortcut: `${modifier}+E`,
            icon: Code01,
            active: selection.code,
            run: () => editor.chain().focus().toggleCode().run(),
          },
        ].map(({ key, label, shortcut, icon, active, run }) => (
          <Tooltip
            key={key}
            label={label}
            shortcut={shortcut}
            tooltipTriggerAsChild
            mountPortalContainer={mountPortalContainer}
            trigger={
              <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={run}
                className={cn(
                  TOOLBAR_BUTTON_CLASS,
                  "size-8",
                  "aria-pressed:border-border aria-pressed:bg-selected aria-pressed:text-foreground",
                  key === "code" &&
                    "relative ml-1 before:absolute before:-left-1 before:h-4 before:w-px before:bg-border"
                )}
              >
                <span aria-hidden="true">
                  {icon ? (
                    <Icon visual={icon} size="xs" />
                  ) : (
                    <span className="text-base line-through">S</span>
                  )}
                </span>
              </button>
            }
          />
        ))}
        {onComment && selection.canComment && (
          <>
            <Separator
              orientation="vertical"
              className="mx-1 h-4 min-h-0 self-center"
            />
            <Tooltip
              label={t`Comment`}
              shortcut={`${modifier}+Alt+M`}
              tooltipTriggerAsChild
              mountPortalContainer={mountPortalContainer}
              trigger={
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onComment}
                  className={cn(TOOLBAR_BUTTON_CLASS, "gap-1.5 px-2 text-sm")}
                >
                  <Icon visual={MessagePlusCircle} size="xs" />
                  <Trans>Comment</Trans>
                </button>
              }
            />
          </>
        )}
      </div>
    </BubbleMenu>
  );
};
