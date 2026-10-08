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
} from "@dust-tt/sparkle";
import { type Editor, useEditorState } from "@tiptap/react";

// The bar over a text selection: comment, then the usual text formatting
// (text style, bold, italic, underline, strikethrough, code, lists, link).

// Sparkle has no underline / strikethrough icons; drawn to match its stroke set.
function UnderlineIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M7 4v6a5 5 0 0 0 10 0V4M5 20h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StrikethroughIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M16.5 7.5C16 5.6 14.2 4.5 12 4.5c-2.8 0-4.5 1.5-4.5 3.4 0 1.6 1 2.7 3.5 3.4M4 12h16M8 16.5c.5 1.9 2.2 3 4.2 3 2.7 0 4.5-1.4 4.5-3.4 0-.8-.2-1.5-.7-2.1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TEXT_STYLES = [
  { label: "Text", level: 0 },
  { label: "Heading 1", level: 1 },
  { label: "Heading 2", level: 2 },
  { label: "Heading 3", level: 3 },
] as const;

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
    }),
  });
  const mark = (
    name: keyof typeof active,
    icon: React.ComponentType<{ className?: string }>,
    tooltip: string,
    toggle: () => void
  ) => (
    <Button
      size="xs"
      variant={active[name] ? "primary" : "ghost-secondary"}
      icon={icon}
      tooltip={tooltip}
      onClick={toggle}
    />
  );
  const chain = () => editor.chain().focus();

  const commentButton = (
    <Button
      size="xs"
      variant="ghost-secondary"
      icon={MessagePlusCircle}
      label="Comment"
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
          onClick={onSuggest}
        />
      </HoveringBar>
    );
  }

  return (
    <HoveringBar size="xs">
      {commentButton}
      <HoveringBar.Separator />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="xs"
            variant="ghost-secondary"
            label="Aa"
            isSelect
            tooltip="Text style"
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
      {mark("bold", Bold01, "Bold", () => chain().toggleBold().run())}
      {mark("italic", Italic01, "Italic", () => chain().toggleItalic().run())}
      {mark("underline", UnderlineIcon, "Underline", () =>
        chain().toggleUnderline().run()
      )}
      {mark("strike", StrikethroughIcon, "Strikethrough", () =>
        chain().toggleStrike().run()
      )}
      {mark("code", Code01, "Code", () => chain().toggleCode().run())}
      <HoveringBar.Separator />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="xs"
            variant="ghost-secondary"
            icon={List}
            isSelect
            tooltip="Lists"
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
      {mark("link", Link01, "Link", () => {
        if (active.link) {
          chain().unsetLink().run();
          return;
        }
        const href = window.prompt("Link to", "https://");
        if (href && href !== "https://") {
          chain().setLink({ href }).run();
        }
      })}
    </HoveringBar>
  );
}
