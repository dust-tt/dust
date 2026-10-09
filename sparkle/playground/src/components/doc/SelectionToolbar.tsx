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
  Pencil01,
  Strikethrough01,
  Trash01,
  Underline01,
} from "@dust-tt/sparkle";
import { type Editor, useEditorState } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

// The bar over a text selection, as production's DocumentSelectionToolbar:
// comment, then the text formatting (text style, bold, italic, underline,
// strikethrough, code, lists, link). The link opens a field in the bar.

const TEXT_STYLES = [
  { label: "Text", level: 0 },
  { label: "Heading 1", level: 1 },
  { label: "Heading 2", level: 2 },
  { label: "Heading 3", level: 3 },
] as const;

const MODIFIER =
  typeof navigator !== "undefined" && /Mac/.test(navigator.platform)
    ? "⌘"
    : "Ctrl";

/** Keeps the editor's selection, and so the bar, while a control is pressed. */
const keepSelection = (event: React.MouseEvent) => event.preventDefault();

/** An http(s) or mailto link; a value without a scheme reads as https. */
function normalizeHref(value: string): string | null {
  const trimmed = value.trim();
  if (/^mailto:/i.test(trimmed)) {
    return /^mailto:[^\s@]+@[^\s@]+$/i.test(trimmed) ? trimmed : null;
  }
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return /^https?:$/.test(url.protocol) && url.hostname.includes(".")
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function LinkField({
  initialHref,
  onApply,
  onCancel,
  onRemove,
}: {
  initialHref: string;
  onApply: (href: string) => void;
  onCancel: () => void;
  onRemove?: () => void;
}) {
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
        aria-label="Link"
        placeholder="Paste or type a link"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) {
            return;
          }
          if (e.key === "Enter" && href) {
            e.preventDefault();
            onApply(href);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
        className="h-7 w-56 min-w-0 rounded-lg border-0 bg-muted-background px-2 text-sm text-foreground shadow-none outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-highlight-300"
      />
      <Button
        size="xs"
        variant="ghost-secondary"
        label="Apply"
        disabled={!href}
        onMouseDown={keepSelection}
        onClick={() => href && onApply(href)}
      />
      {onRemove && (
        <Button
          size="xs"
          variant="ghost-secondary"
          icon={Trash01}
          tooltip="Remove link"
          onMouseDown={keepSelection}
          onClick={onRemove}
        />
      )}
    </div>
  );
}

export function SelectionToolbar({
  editor,
  readOnly,
  onComment,
  onSuggest,
}: {
  editor: Editor;
  /** The viewer can't edit: comment or suggest an edit, no formatting. */
  readOnly: boolean;
  onComment: () => void;
  onSuggest: () => void;
}) {
  const [isEditingLink, setIsEditingLink] = useState(false);
  // Re-render on selection/format changes so active marks light up.
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      href: (e.getAttributes("link").href as string | undefined) ?? "",
    }),
  });
  const chain = () => editor.chain().focus();

  const marks = [
    {
      name: "bold",
      label: "Bold",
      shortcut: `${MODIFIER}+B`,
      icon: Bold01,
      toggle: () => chain().toggleBold().run(),
    },
    {
      name: "italic",
      label: "Italic",
      shortcut: `${MODIFIER}+I`,
      icon: Italic01,
      toggle: () => chain().toggleItalic().run(),
    },
    {
      name: "underline",
      label: "Underline",
      shortcut: `${MODIFIER}+U`,
      icon: Underline01,
      toggle: () => chain().toggleUnderline().run(),
    },
    {
      name: "strike",
      label: "Strikethrough",
      shortcut: `${MODIFIER}+Shift+S`,
      icon: Strikethrough01,
      toggle: () => chain().toggleStrike().run(),
    },
    {
      name: "code",
      label: "Inline code",
      shortcut: `${MODIFIER}+E`,
      icon: Code01,
      toggle: () => chain().toggleCode().run(),
    },
  ] as const;

  const commentButton = (
    <Button
      size="xs"
      variant="ghost-secondary"
      icon={MessagePlusCircle}
      label="Comment"
      tooltip="Comment"
      tooltipShortcut={`${MODIFIER}+Alt+M`}
      onMouseDown={keepSelection}
      onClick={onComment}
    />
  );
  if (readOnly) {
    return (
      <HoveringBar size="xs">
        {commentButton}
        <HoveringBar.Separator />
        <Button
          size="xs"
          variant="ghost-secondary"
          icon={Pencil01}
          label="Suggest edit"
          onMouseDown={keepSelection}
          onClick={onSuggest}
        />
      </HoveringBar>
    );
  }

  if (isEditingLink) {
    return (
      <HoveringBar size="xs">
        <LinkField
          initialHref={active.href}
          onApply={(href) => {
            setIsEditingLink(false);
            chain().extendMarkRange("link").setLink({ href }).run();
          }}
          onCancel={() => {
            setIsEditingLink(false);
            editor.commands.focus();
          }}
          onRemove={
            active.link
              ? () => {
                  setIsEditingLink(false);
                  chain().extendMarkRange("link").unsetLink().run();
                }
              : undefined
          }
        />
      </HoveringBar>
    );
  }

  return (
    <HoveringBar size="xs">
      {commentButton}
      <HoveringBar.Separator />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            size="xs"
            variant="ghost-secondary"
            label="Aa"
            aria-label="Text style"
            isSelect
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" mountPortal={false}>
          {TEXT_STYLES.map(({ label, level }) => (
            <DropdownMenuItem
              key={label}
              label={label}
              onClick={() =>
                level === 0
                  ? chain().setParagraph().run()
                  : chain().toggleHeading({ level }).run()
              }
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <HoveringBar.Separator />
      {marks.map(({ name, label, shortcut, icon, toggle }) => (
        <Button
          key={name}
          size="xs"
          variant={active[name] ? "primary" : "ghost-secondary"}
          icon={icon}
          tooltip={label}
          tooltipShortcut={shortcut}
          aria-pressed={active[name]}
          onMouseDown={keepSelection}
          onClick={toggle}
        />
      ))}
      <HoveringBar.Separator />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            size="xs"
            variant="ghost-secondary"
            icon={List}
            aria-label="Lists"
            isSelect
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" mountPortal={false}>
          <DropdownMenuItem
            label="Bulleted list"
            onClick={() => chain().toggleBulletList().run()}
          />
          <DropdownMenuItem
            label="Numbered list"
            onClick={() => chain().toggleOrderedList().run()}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <HoveringBar.Separator />
      <Button
        size="xs"
        variant={active.link ? "primary" : "ghost-secondary"}
        icon={Link01}
        tooltip={active.link ? "Edit link" : "Link"}
        onMouseDown={keepSelection}
        onClick={() => setIsEditingLink(true)}
      />
    </HoveringBar>
  );
}
