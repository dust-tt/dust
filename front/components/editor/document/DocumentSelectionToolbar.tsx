import { BLOCKS } from "@app/components/editor/document/blocks";
import { documentCommentsPluginKey } from "@app/components/editor/document/DocumentComments";
import { validateUrl } from "@app/types/shared/utils/url_utils";
import {
  Bold01,
  Button,
  Code01,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HoveringBar,
  Italic01,
  Link01,
  List,
  MessagePlusCircle,
  Strikethrough01,
  Trash01,
  Underline01,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { Editor } from "@tiptap/core";
import { isTextSelection } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import type React from "react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

interface DocumentSelectionToolbarProps {
  editor: Editor;
  /** Shows the Comment action before the formatting controls. */
  onComment?: () => void;
  /** Extra controls shown after the formatting controls. */
  children?: ReactNode;
}

const TEXT_STYLES = BLOCKS.filter(
  ({ selectionToolbarMenu }) => selectionToolbarMenu === "textStyle"
);
const LIST_STYLES = BLOCKS.filter(
  ({ selectionToolbarMenu }) => selectionToolbarMenu === "list"
);

/** Keeps the editor's selection, and so the toolbar, while a control is pressed. */
const keepSelection = (event: React.MouseEvent) => event.preventDefault();

/** An http(s) or mailto link; a value without a scheme reads as https. Null for anything else. */
export const normalizeHref = (value: string): string | null => {
  const trimmed = value.trim();
  if (/^mailto:/i.test(trimmed)) {
    return /^mailto:[^\s@]+@[^\s@]+$/i.test(trimmed) ? trimmed : null;
  }
  const { valid, standardized } = validateUrl(
    trimmed.includes("://") ? trimmed : `https://${trimmed}`
  );
  return valid ? standardized : null;
};

const linkHref = (editor: Editor): string => {
  const { href } = editor.getAttributes("link");
  return typeof href === "string" ? href : "";
};

interface LinkFieldProps {
  initialHref: string;
  onApply: (href: string) => void;
  onCancel: () => void;
  onRemove?: () => void;
}

const LinkField = ({
  initialHref,
  onApply,
  onCancel,
  onRemove,
}: LinkFieldProps) => {
  const { t } = useLingui();
  const [value, setValue] = useState(initialHref);
  const inputRef = useRef<HTMLInputElement>(null);
  const href = normalizeHref(value);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="url"
        aria-label={t`Link`}
        placeholder={t`Paste or type a link`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) {
            return;
          }
          if (event.key === "Enter" && href) {
            event.preventDefault();
            onApply(href);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
        }}
        className="h-7 w-56 min-w-0 rounded-lg border-0 bg-muted-background px-2 text-sm text-foreground shadow-none outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-highlight-300"
      />
      <Button
        size="xs"
        variant="ghost-secondary"
        label={t`Apply`}
        disabled={!href}
        onMouseDown={keepSelection}
        onClick={() => href && onApply(href)}
      />
      {onRemove && (
        <Button
          size="xs"
          variant="ghost-secondary"
          icon={Trash01}
          tooltip={t`Remove link`}
          onMouseDown={keepSelection}
          onClick={onRemove}
        />
      )}
    </div>
  );
};

/**
 * @cc [owner:flvndvd;tdraier,label:product] document-comment-cta
 * The Comment action MUST appear first, only when onComment is provided and the selection can
 * start a draft. The toolbar MUST stay hidden while a comment draft is pending.
 */
/**
 * @cc [owner:PopDaph;tdraier,label:product] document-selection-toolbar
 * The toolbar MUST offer, over a nonempty text selection of an editable document: a text style
 * menu (text, headings 1 to 3), bold, italic, underline, strikethrough, inline code, a list menu
 * (bulleted, numbered) and a link control. A link MUST be a valid http(s) URL, a value without a
 * scheme reading as https, or a mailto address. Using a control MUST keep the editor's selection,
 * except that applying or removing a link MUST act on the whole link under the selection.
 */
/**
 * @cc [owner:tdraier,label:product] document-link-editing
 * Over a linked selection, the link control MUST open the link field prefilled with the link's
 * URL, with an action to remove the link.
 */
export const DocumentSelectionToolbar = ({
  editor,
  onComment,
  children,
}: DocumentSelectionToolbarProps) => {
  const { t } = useLingui();
  const [editingLink, setEditingLink] = useState(false);
  const selection = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      strike: editor.isActive("strike"),
      code: editor.isActive("code"),
      link: editor.isActive("link"),
      href: linkHref(editor),
      // The comment command only exists in editors that load the comments extension.
      canComment: !!onComment && editor.can().startCommentDraft(),
    }),
  });
  const isApple =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform);
  const modifier = isApple ? "Cmd" : "Ctrl";
  const chain = () => editor.chain().focus();

  const marks = [
    {
      key: "bold",
      label: t`Bold`,
      shortcut: `${modifier}+B`,
      icon: Bold01,
      active: selection.bold,
      run: () => chain().toggleBold().run(),
    },
    {
      key: "italic",
      label: t`Italic`,
      shortcut: `${modifier}+I`,
      icon: Italic01,
      active: selection.italic,
      run: () => chain().toggleItalic().run(),
    },
    {
      key: "underline",
      label: t`Underline`,
      shortcut: `${modifier}+U`,
      icon: Underline01,
      active: selection.underline,
      run: () => chain().toggleUnderline().run(),
    },
    {
      key: "strike",
      label: t`Strikethrough`,
      shortcut: `${modifier}+Shift+S`,
      icon: Strikethrough01,
      active: selection.strike,
      run: () => chain().toggleStrike().run(),
    },
    {
      key: "code",
      label: t`Inline code`,
      shortcut: `${modifier}+E`,
      icon: Code01,
      active: selection.code,
      run: () => chain().toggleCode().run(),
    },
  ];

  return (
    <BubbleMenu
      editor={editor}
      options={{
        placement: "top",
        offset: 8,
        onHide: () => setEditingLink(false),
      }}
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
      >
        <HoveringBar size="xs">
          {editingLink ? (
            <LinkField
              initialHref={selection.href}
              onApply={(href) => {
                setEditingLink(false);
                chain().extendMarkRange("link").setLink({ href }).run();
              }}
              onCancel={() => {
                setEditingLink(false);
                editor.commands.focus();
              }}
              onRemove={
                selection.link
                  ? () => {
                      setEditingLink(false);
                      chain().extendMarkRange("link").unsetLink().run();
                    }
                  : undefined
              }
            />
          ) : (
            <>
              {onComment && selection.canComment && (
                <>
                  <Button
                    size="xs"
                    variant="ghost-secondary"
                    icon={MessagePlusCircle}
                    label={t`Comment`}
                    tooltip={t`Comment`}
                    tooltipShortcut={`${modifier}+Alt+M`}
                    onMouseDown={keepSelection}
                    onClick={onComment}
                  />
                  <HoveringBar.Separator />
                </>
              )}
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="xs"
                    variant="ghost-secondary"
                    label="Aa"
                    aria-label={t`Text style`}
                    isSelect
                    onMouseDown={keepSelection}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" mountPortal={false}>
                  {TEXT_STYLES.map(({ name, apply }) => (
                    <DropdownMenuItem
                      key={name.id}
                      label={t(name)}
                      onClick={() => apply(chain())}
                    />
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <HoveringBar.Separator />
              {marks.map(({ key, label, shortcut, icon, active, run }) => (
                <Button
                  key={key}
                  size="xs"
                  variant={active ? "primary" : "ghost-secondary"}
                  icon={icon}
                  tooltip={label}
                  tooltipShortcut={shortcut}
                  aria-pressed={active}
                  onMouseDown={keepSelection}
                  onClick={run}
                />
              ))}
              <HoveringBar.Separator />
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="xs"
                    variant="ghost-secondary"
                    icon={List}
                    aria-label={t`Lists`}
                    isSelect
                    onMouseDown={keepSelection}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" mountPortal={false}>
                  {LIST_STYLES.map(({ name, apply }) => (
                    <DropdownMenuItem
                      key={name.id}
                      label={t(name)}
                      onClick={() => apply(chain())}
                    />
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <HoveringBar.Separator />
              <Button
                size="xs"
                variant={selection.link ? "primary" : "ghost-secondary"}
                icon={Link01}
                tooltip={selection.link ? t`Edit link` : t`Link`}
                aria-pressed={selection.link}
                onMouseDown={keepSelection}
                onClick={() => setEditingLink(true)}
              />
              {children}
            </>
          )}
        </HoveringBar>
      </div>
    </BubbleMenu>
  );
};
