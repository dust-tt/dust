import "tippy.js/dist/tippy.css";

import { mergeAttributes, Mark } from "@tiptap/core";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, ReactRenderer, useEditor } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import React, {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";

import { Avatar } from "@dust-tt/sparkle";
import { menuStyleClasses } from "@sparkle/components/Dropdown";
import { cn } from "@sparkle/lib/utils";

import { mockAgents, mockUsers } from "../data";

type MentionItemType = "user" | "agent";

type MentionItem = {
  id: string;
  label: string;
  type: MentionItemType;
  avatarUrl?: string;
  avatarEmoji?: string;
  avatarColor?: string;
};

type SuggestionProps = {
  items: MentionItem[];
  command: (item: MentionItem) => void;
};

type SuggestionKeyDownProps = {
  event: KeyboardEvent;
};

type SuggestionListHandle = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
};

const SuggestionList = forwardRef<SuggestionListHandle, SuggestionProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) {
        command(item);
      }
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (!items.length) {
          return false;
        }

        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return true;
        }

        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
          return true;
        }

        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }

        return false;
      },
    }));

    return (
      <div className={cn(menuStyleClasses.container, "s-w-72 s-p-0 s-shadow-lg")}>
        {items.length === 0 ? (
          <div className="s-px-3 s-py-3 s-text-sm s-text-muted-foreground">
            No matches
          </div>
        ) : (
          items.map((item, index) => (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              className={cn(
                menuStyleClasses.item({ variant: "default" }),
                "s-w-full s-text-left",
                index === selectedIndex
                  ? "s-bg-muted-background dark:s-bg-muted-night"
                  : ""
              )}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => selectItem(index)}
            >
              <Avatar
                size="xs"
                name={item.label}
                emoji={item.avatarEmoji}
                backgroundColor={item.avatarColor}
                visual={item.avatarUrl}
                isRounded={item.type === "user"}
              />
              <div className="s-flex s-min-w-0 s-flex-1 s-items-center">
                <div className="s-truncate s-heading-sm s-text-foreground">
                  {item.label}
                </div>
              </div>
              <span className="s-text-xs s-font-normal s-text-muted-foreground">
                {item.type === "user" ? "Member" : "Agent"}
              </span>
            </button>
          ))
        )}
      </div>
    );
  }
);

SuggestionList.displayName = "SuggestionList";

const SuggestionAdd = Mark.create({
  name: "suggestionAdd",
  parseHTML() {
    return [{ tag: "span[data-suggestion-add]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-suggestion-add": "",
        class:
          "s-rounded s-bg-emerald-100 s-px-0.5 s-text-emerald-800 dark:s-bg-emerald-900/30 dark:s-text-emerald-200",
      }),
      0,
    ];
  },
});

const SuggestionRemove = Mark.create({
  name: "suggestionRemove",
  parseHTML() {
    return [{ tag: "span[data-suggestion-remove]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-suggestion-remove": "",
        class:
          "s-rounded s-bg-rose-100 s-px-0.5 s-text-rose-700 s-line-through dark:s-bg-rose-900/30 dark:s-text-rose-200",
      }),
      0,
    ];
  },
});

const getMentionItems = (query: string): MentionItem[] => {
  const normalized = query.trim().toLowerCase();

  const users = mockUsers.map((user) => ({
    id: user.id,
    label: user.fullName,
    sublabel: user.email,
    type: "user" as const,
    avatarUrl: user.portrait,
  }));

  const agents = mockAgents.map((agent) => ({
    id: agent.id,
    label: agent.name,
    sublabel: agent.description,
    type: "agent" as const,
    avatarEmoji: agent.emoji,
    avatarColor: agent.backgroundColor,
  }));

  const combined = [...users, ...agents];

  if (!normalized) {
    return combined.slice(0, 8);
  }

  return combined
    .filter((item) => item.label.toLowerCase().includes(normalized))
    .slice(0, 8);
};

const mentionExtension = Mention.configure({
  HTMLAttributes: {
    class: "s-text-highlight-600 dark:s-text-highlight-600-night",
  },
  renderLabel({ node }) {
    return `@${node.attrs.label ?? node.attrs.id}`;
  },
  char: "@",
  suggestion: {
    items: ({ query }) => getMentionItems(query),
    render: () => {
      let reactRenderer: ReactRenderer<SuggestionListHandle> | null = null;
      let popup: TippyInstance | null = null;

      return {
        onStart: (props) => {
          reactRenderer = new ReactRenderer(SuggestionList, {
            props,
            editor: props.editor,
          });

          popup = tippy(document.body, {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: reactRenderer.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
            arrow: false,
            theme: "sparkle",
          })[0];
        },
        onUpdate: (props) => {
          reactRenderer?.updateProps(props);
          popup?.setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          });
        },
        onKeyDown: (props) => {
          if (props.event.key === "Escape") {
            popup?.hide();
            return true;
          }

          return reactRenderer?.ref?.onKeyDown(props) ?? false;
        },
        onExit: () => {
          popup?.destroy();
          reactRenderer?.destroy();
        },
      };
    },
  },
});

const baseEditorClassName = cn(
  "s-w-full s-px-3 s-py-2 s-text-base",
  "s-text-foreground dark:s-text-foreground-night",
  "s-bg-muted-background dark:s-bg-muted-background-night",
  "s-border s-rounded-xl s-transition s-duration-100 focus-visible:s-outline-none",
  "s-border-border dark:s-border-border-night",
  "focus-visible:s-border-border-focus dark:focus-visible:s-border-border-focus-night",
  "focus-visible:s-outline-none focus-visible:s-ring-2",
  "focus-visible:s-ring-highlight/20 dark:focus-visible:s-ring-highlight/50",
  "s-min-h-40 s-leading-6 s-outline-none s-whitespace-pre-wrap s-break-words"
);

export type RichTextAreaHandle = {
  insertSuggestion: (options: {
    addedText: string;
    removedText?: string;
  }) => void;
};

type RichTextAreaProps = {
  className?: string;
  placeholder?: string;
};

export const RichTextArea = forwardRef<RichTextAreaHandle, RichTextAreaProps>(
  ({ className, placeholder }, ref) => {
    const editor = useEditor({
      extensions: [
        StarterKit,
        mentionExtension,
        SuggestionAdd,
        SuggestionRemove,
        Placeholder.configure({
          placeholder: placeholder ?? "Write instructions for your agent...",
          emptyEditorClass: "is-editor-empty",
        }),
      ],
      editorProps: {
        attributes: {
          class: cn(baseEditorClassName, "sparkle-richtextarea", className),
        },
      },
    });

    const insertSuggestion = useMemo(() => {
      return (options: { addedText: string; removedText?: string }) => {
        if (!editor) {
          return;
        }

        const content: Array<{ type: string; text?: string; marks?: unknown[] }> =
          [];

        if (options.removedText) {
          content.push({
            type: "text",
            text: options.removedText,
            marks: [{ type: "suggestionRemove" }],
          });
        }

        if (options.removedText && options.addedText) {
          content.push({ type: "text", text: " " });
        }

        if (options.addedText) {
          content.push({
            type: "text",
            text: options.addedText,
            marks: [{ type: "suggestionAdd" }],
          });
        }

        editor
          .chain()
          .focus("end")
          .insertContent({ type: "paragraph", content })
          .run();
      };
    }, [editor]);

    useImperativeHandle(
      ref,
      () => ({
        insertSuggestion,
      }),
      [insertSuggestion]
    );

    if (!editor) {
      return null;
    }

    return <EditorContent editor={editor} />;
  }
);

RichTextArea.displayName = "RichTextArea";
