import "tippy.js/dist/tippy.css";

import { Extension, mergeAttributes, Mark } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, ReactRenderer, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { EditorState, Plugin, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { cva } from "class-variance-authority";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";

import {
  Avatar,
  BoldIcon,
  Button,
  CheckIcon,
  HoveringBar,
  ItalicIcon,
  LinkIcon,
  PencilSquareIcon,
  SparklesIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
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
      <div
        className={cn(menuStyleClasses.container, "s-w-72 s-p-0 s-shadow-lg")}
      >
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
                <div className="s-heading-sm s-truncate s-text-foreground">
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
        class: "s-rounded s-px-0.5",
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
        class: "s-rounded s-px-0.5 s-line-through",
      }),
      0,
    ];
  },
});

const DiffAdd = Mark.create({
  name: "diffAdd",
  parseHTML() {
    return [{ tag: "span[data-diff-add]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-diff-add": "",
        class:
          "s-rounded s-bg-success-100 dark:s-bg-success-100-night s-px-0.5 s-text-success-800 dark:s-text-success-800-night",
      }),
      0,
    ];
  },
});

const DiffRemove = Mark.create({
  name: "diffRemove",
  parseHTML() {
    return [{ tag: "span[data-diff-remove]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-diff-remove": "",
        class:
          "s-rounded s-bg-warning-100 dark:s-bg-warning-100-night s-px-0.5 s-text-warning-800 dark:s-text-warning-800-night s-line-through",
      }),
      0,
    ];
  },
});

const collectSuggestionNodes = (state: EditorState) => {
  const nodes: Array<{
    from: number;
    to: number;
    text: string;
    isAdd: boolean;
    isRemove: boolean;
  }> = [];

  state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const hasAddMark = node.marks.some((m) => m.type.name === "suggestionAdd");
    const hasRemoveMark = node.marks.some(
      (m) => m.type.name === "suggestionRemove"
    );
    if (hasAddMark || hasRemoveMark) {
      nodes.push({
        from: pos,
        to: pos + node.nodeSize,
        text: node.text || "",
        isAdd: hasAddMark,
        isRemove: hasRemoveMark,
      });
    }
  });

  return nodes;
};

const getSuggestionBlockRange = (
  state: EditorState
): {
  start: number;
  end: number;
  additions: Array<{ from: number; to: number; text: string }>;
  removals: Array<{ from: number; to: number; text: string }>;
} | null => {
  const { from } = state.selection;

  const allSuggestionNodes = collectSuggestionNodes(state);

  if (allSuggestionNodes.length === 0) return null;

  const cursorNode = allSuggestionNodes.find(
    (n) => from >= n.from && from <= n.to
  );

  if (!cursorNode) return null;

  const blockNodes: typeof allSuggestionNodes = [cursorNode];

  let changed = true;
  while (changed) {
    changed = false;
    const firstNode = blockNodes[0];
    for (const node of allSuggestionNodes) {
      if (blockNodes.includes(node)) continue;
      const gap = firstNode.from - node.to;
      if (gap >= 0 && gap <= 1) {
        blockNodes.unshift(node);
        changed = true;
        break;
      }
    }
  }

  changed = true;
  while (changed) {
    changed = false;
    const lastNode = blockNodes[blockNodes.length - 1];
    for (const node of allSuggestionNodes) {
      if (blockNodes.includes(node)) continue;
      const gap = node.from - lastNode.to;
      if (gap >= 0 && gap <= 1) {
        blockNodes.push(node);
        changed = true;
        break;
      }
    }
  }

  blockNodes.sort((a, b) => a.from - b.from);

  const start = blockNodes[0].from;
  const end = blockNodes[blockNodes.length - 1].to;

  const additions = blockNodes
    .filter((n) => n.isAdd)
    .map((n) => ({ from: n.from, to: n.to, text: n.text }));
  const removals = blockNodes
    .filter((n) => n.isRemove)
    .map((n) => ({ from: n.from, to: n.to, text: n.text }));

  return { start, end, additions, removals };
};

const suggestionSelectionVariants = cva(
  "s-transition-colors s-duration-200 s-ease-in-out",
  {
    variants: {
      kind: {
        add: "",
        remove: "",
      },
      state: {
        selected: "",
        unselected: "",
      },
    },
    compoundVariants: [
      {
        kind: "add",
        state: "selected",
        className:
          "s-rounded s-bg-highlight-100 dark:s-bg-highlight-100 s-text-highlight-800 dark:s-text-highlight-800-night",
      },
      {
        kind: "add",
        state: "unselected",
        className:
          "s-rounded s-bg-highlight-50 dark:s-bg-highlight-50-night s-text-muted-foreground dark:s-text-muted-foreground-night",
      },
      {
        kind: "remove",
        state: "selected",
        className:
          "s-rounded s-bg-warning-100 s-text-warning-800 dark:s-text-warning-800-night",
      },
      {
        kind: "remove",
        state: "unselected",
        className:
          "s-rounded s-bg-warning-50 dark:s-bg-muted-background-night s-text-muted-foreground dark:s-text-muted-foreground-night",
      },
    ],
  }
);

const SuggestionSelectionHighlight = Extension.create({
  name: "suggestionSelectionHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const range = getSuggestionBlockRange(state);
            const allSuggestionNodes = collectSuggestionNodes(state);
            if (allSuggestionNodes.length === 0) return null;

            const decorations: Decoration[] = [];
            const selectedStart = range?.start ?? -1;
            const selectedEnd = range?.end ?? -1;

            if (selectedStart !== -1 && selectedEnd !== -1) {
              decorations.push(
                Decoration.inline(selectedStart, selectedEnd, {
                  class: "",
                })
              );
            }

            for (const node of allSuggestionNodes) {
              const isSelected =
                selectedStart !== -1 &&
                node.to >= selectedStart &&
                node.from <= selectedEnd;

              const className = suggestionSelectionVariants({
                kind: node.isAdd ? "add" : "remove",
                state: isSelected ? "selected" : "unselected",
              });

              decorations.push(
                Decoration.inline(node.from, node.to, {
                  class: className,
                })
              );
            }

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
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

const mentionExtension = Mention.extend({
  draggable: true,
}).configure({
  HTMLAttributes: {
    class: cn(
      "sparkle-mention",
      "s-rounded s-px-1 s-transition-colors",
      "s-text-highlight-600 dark:s-text-highlight-600-night",
      "hover:s-bg-highlight-100 dark:hover:s-bg-highlight-100-night",
      "hover:s-text-highlight-800 dark:hover:s-text-highlight-800-night"
    ),
  },
  renderText({ node }) {
    const label = node.attrs.label ?? node.attrs.id ?? "";
    return `@${label}`;
  },
  renderHTML({ node, options }) {
    const label = node.attrs.label ?? node.attrs.id ?? "";
    return ["span", mergeAttributes(options.HTMLAttributes), `@${label}`];
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

const instructionSnippetMark = Mark.create({
  name: "instructionSnippet",
  addAttributes() {
    return {
      id: { default: null },
      label: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-instruction-snippet]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-instruction-snippet": "",
        class: cn(
          "sparkle-instruction",
          "s-rounded s-text-golden-900 s-bg-golden-100 s-px-1",
          "dark:s-text-golden-900-night dark:s-bg-golden-100-night"
        ),
      }),
      0,
    ];
  },
});

const richTextAreaVariants = cva(
  cn(
    "s-w-full s-text-base s-leading-6 s-outline-none s-whitespace-pre-wrap s-break-words",
    "s-text-foreground dark:s-text-foreground-night"
  ),
  {
    variants: {
      variant: {
        default: cn(
          "s-px-3 s-py-2",
          "s-bg-muted-background dark:s-bg-muted-background-night",
          "s-border s-rounded-xl s-transition s-duration-100",
          "s-border-border dark:s-border-border-night",
          "focus-visible:s-border-border-focus dark:focus-visible:s-border-border-focus-night",
          "focus-visible:s-outline-none focus-visible:s-ring-2",
          "focus-visible:s-ring-highlight/20 dark:focus-visible:s-ring-highlight/50",
          "s-min-h-40"
        ),
        compact: cn(
          "s-p-5",
          "s-bg-transparent s-border-0 s-rounded-none",
          "focus-visible:s-ring-0 focus-visible:s-border-0",
          "s-min-h-0"
        ),
        embedded: cn(
          "s-px-3 s-py-2",
          "s-bg-transparent s-border-0 s-rounded-none",
          "focus-visible:s-ring-0 focus-visible:s-border-0",
          "s-min-h-0"
        ),
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export type RichTextAreaHandle = {
  insertSuggestion: (options: {
    addedText: string;
    removedText?: string;
  }) => void;
  insertMention: (options: { id: string; label: string }) => void;
  insertInstructionSnippet: (options: { id: string; label: string }) => void;
  setContent: (text: string) => void;
  applyRandomSuggestions: (changes: string[]) => void;
  hasSuggestions: () => boolean;
  acceptAllSuggestions: () => void;
  rejectAllSuggestions: () => void;
};

type RichTextAreaProps = {
  className?: string;
  containerClassName?: string;
  topBarClassName?: string;
  placeholder?: string;
  topBar?: React.ReactNode;
  onAskCopilot?: (payload: {
    selectedText: string;
    start: number;
    end: number;
  }) => void;
  onSuggestionsChange?: (hasSuggestions: boolean) => void;
  onTextChange?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  scrollContainer?: HTMLElement | null;
  readOnly?: boolean;
  defaultValue?: string;
  variant?: "default" | "compact" | "embedded";
  showFormattingMenu?: boolean;
  showAskCopilotMenu?: boolean;
};

export const RichTextArea = forwardRef<RichTextAreaHandle, RichTextAreaProps>(
  (
    {
      className,
      containerClassName,
      topBarClassName,
      placeholder,
      topBar,
      onAskCopilot,
      onSuggestionsChange,
      onTextChange,
      onFocus,
      onBlur,
      scrollContainer,
      readOnly,
      defaultValue,
      variant = "default",
      showFormattingMenu = false,
      showAskCopilotMenu = true,
    },
    ref
  ) => {
    const hasTopBar = Boolean(topBar);
    const editorVariant =
      hasTopBar && variant === "default" ? "embedded" : variant;
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          link: false,
        }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          HTMLAttributes: {
            class:
              "s-text-highlight-600 dark:s-text-highlight-600-night s-underline",
          },
        }),
        mentionExtension,
        instructionSnippetMark,
        SuggestionAdd,
        SuggestionRemove,
        SuggestionSelectionHighlight,
        DiffAdd,
        DiffRemove,
        Placeholder.configure({
          placeholder: placeholder ?? "Write instructions for your agent...",
          emptyEditorClass: "is-editor-empty",
        }),
      ],
      editorProps: {
        attributes: {
          class: cn(
            richTextAreaVariants({ variant: editorVariant }),
            "sparkle-richtextarea",
            className
          ),
        },
        handleDOMEvents: {
          click: (view, event) => {
            const coords = { left: event.clientX, top: event.clientY };
            const pos = view.posAtCoords(coords);
            if (!pos) return false;

            const marks = view.state.doc.resolve(pos.pos).marks();
            const isOnSuggestion = marks.some(
              (mark) =>
                mark.type.name === "suggestionAdd" ||
                mark.type.name === "suggestionRemove"
            );

            if (isOnSuggestion) {
              const tr = view.state.tr.setSelection(
                TextSelection.create(view.state.doc, pos.pos)
              );
              view.dispatch(tr);
              view.focus();
              return true;
            }

            return false;
          },
          focus: () => {
            onFocus?.();
            return false;
          },
          blur: () => {
            onBlur?.();
            return false;
          },
        },
      },
      editable: !readOnly,
      content: defaultValue,
    });

    const insertSuggestion = useMemo(() => {
      return (options: { addedText: string; removedText?: string }) => {
        if (!editor) {
          return;
        }

        const content: Array<{
          type: string;
          text?: string;
          marks?: unknown[];
        }> = [];

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
    const insertMention = useMemo(() => {
      return (options: { id: string; label: string }) => {
        if (!editor) {
          return;
        }

        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: "mention",
              attrs: { id: options.id, label: options.label },
            },
            { type: "text", text: " " },
          ])
          .run();
      };
    }, [editor]);
    const insertInstructionSnippet = useMemo(() => {
      return (options: { id: string; label: string }) => {
        if (!editor) {
          return;
        }

        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: "text",
              text: options.label,
              marks: [
                {
                  type: "instructionSnippet",
                  attrs: { id: options.id, label: options.label },
                },
              ],
            },
            { type: "text", text: " " },
          ])
          .run();
      };
    }, [editor]);
    const setContent = useMemo(() => {
      return (text: string) => {
        if (!editor) {
          return;
        }

        const lines = text.split("\n");
        const content = lines.flatMap((line, index) => {
          const nodes = [];
          if (index > 0) {
            nodes.push({ type: "hardBreak" });
          }
          if (line.length > 0) {
            nodes.push({ type: "text", text: line });
          }
          return nodes;
        });

        editor.commands.setContent({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: content.length ? content : [{ type: "text", text: "" }],
            },
          ],
        });
      };
    }, [editor]);
    const applyRandomSuggestions = useMemo(() => {
      return (changes: string[]) => {
        if (!editor || changes.length === 0) {
          return;
        }

        const suggestionCount = Math.floor(Math.random() * 3) + 1;

        for (let index = 0; index < suggestionCount; index += 1) {
          const change = changes[Math.floor(Math.random() * changes.length)];
          const docSize = editor.state.doc.content.size;
          const shouldReplace = Math.random() > 0.5 && docSize > 1;

          if (shouldReplace) {
            const start = Math.floor(Math.random() * Math.max(docSize - 1, 1));
            const maxLength = Math.min(24, docSize - start);
            const length = Math.max(
              1,
              Math.floor(Math.random() * maxLength) + 1
            );
            const from = start;
            const to = Math.min(docSize, start + length);
            const removedText = editor.state.doc.textBetween(
              from,
              to,
              "\n",
              "\n"
            );
            const content = [];

            if (removedText) {
              content.push({
                type: "text",
                text: removedText,
                marks: [{ type: "suggestionRemove" }],
              });
            }

            if (removedText && change) {
              content.push({ type: "text", text: " " });
            }

            content.push({
              type: "text",
              text: change,
              marks: [{ type: "suggestionAdd" }],
            });

            editor.commands.insertContentAt({ from, to }, content);
          } else {
            const pos = Math.floor(Math.random() * (docSize + 1));
            editor.commands.insertContentAt(pos, [
              {
                type: "text",
                text: ` ${change}`,
                marks: [{ type: "suggestionAdd" }],
              },
            ]);
          }
        }
      };
    }, [editor]);

    const hasSuggestions = useMemo(() => {
      return () => {
        if (!editor) return false;
        let found = false;
        editor.state.doc.descendants((node) => {
          if (node.isText) {
            const hasAddMark = node.marks.some(
              (m) => m.type.name === "suggestionAdd"
            );
            const hasRemoveMark = node.marks.some(
              (m) => m.type.name === "suggestionRemove"
            );
            if (hasAddMark || hasRemoveMark) {
              found = true;
              return false; // Stop iteration
            }
          }
        });
        return found;
      };
    }, [editor]);

    useEffect(() => {
      if (!editor || !onSuggestionsChange) return;
      const emit = () => onSuggestionsChange(hasSuggestions());
      emit();
      editor.on("update", emit);
      return () => {
        editor.off("update", emit);
      };
    }, [editor, hasSuggestions, onSuggestionsChange]);

    useEffect(() => {
      if (!editor || !onTextChange) return;
      const emit = () => onTextChange(editor.getText());
      emit();
      editor.on("update", emit);
      return () => {
        editor.off("update", emit);
      };
    }, [editor, onTextChange]);

    const acceptAllSuggestions = useMemo(() => {
      return () => {
        if (!editor) return;

        // Collect all suggestion-marked nodes
        const allNodes: Array<{
          from: number;
          to: number;
          text: string;
          isAdd: boolean;
          isRemove: boolean;
        }> = [];

        editor.state.doc.descendants((node, pos) => {
          if (node.isText) {
            const hasAddMark = node.marks.some(
              (m) => m.type.name === "suggestionAdd"
            );
            const hasRemoveMark = node.marks.some(
              (m) => m.type.name === "suggestionRemove"
            );
            if (hasAddMark || hasRemoveMark) {
              allNodes.push({
                from: pos,
                to: pos + node.nodeSize,
                text: node.text || "",
                isAdd: hasAddMark,
                isRemove: hasRemoveMark,
              });
            }
          }
        });

        if (allNodes.length === 0) return;

        // Process in reverse order to maintain positions
        // Accept: keep additions (as plain text), delete removals
        const sortedNodes = [...allNodes].sort((a, b) => b.from - a.from);

        for (const node of sortedNodes) {
          if (node.isRemove) {
            // Delete removal text
            editor.commands.deleteRange({ from: node.from, to: node.to });
          } else if (node.isAdd) {
            // Replace with plain text (remove mark)
            editor
              .chain()
              .setTextSelection({ from: node.from, to: node.to })
              .unsetMark("suggestionAdd")
              .run();
          }
        }
      };
    }, [editor]);

    const rejectAllSuggestions = useMemo(() => {
      return () => {
        if (!editor) return;

        // Collect all suggestion-marked nodes
        const allNodes: Array<{
          from: number;
          to: number;
          text: string;
          isAdd: boolean;
          isRemove: boolean;
        }> = [];

        editor.state.doc.descendants((node, pos) => {
          if (node.isText) {
            const hasAddMark = node.marks.some(
              (m) => m.type.name === "suggestionAdd"
            );
            const hasRemoveMark = node.marks.some(
              (m) => m.type.name === "suggestionRemove"
            );
            if (hasAddMark || hasRemoveMark) {
              allNodes.push({
                from: pos,
                to: pos + node.nodeSize,
                text: node.text || "",
                isAdd: hasAddMark,
                isRemove: hasRemoveMark,
              });
            }
          }
        });

        if (allNodes.length === 0) return;

        // Process in reverse order to maintain positions
        // Reject: delete additions, keep removals (as plain text)
        const sortedNodes = [...allNodes].sort((a, b) => b.from - a.from);

        for (const node of sortedNodes) {
          if (node.isAdd) {
            // Delete addition text
            editor.commands.deleteRange({ from: node.from, to: node.to });
          } else if (node.isRemove) {
            // Replace with plain text (remove mark)
            editor
              .chain()
              .setTextSelection({ from: node.from, to: node.to })
              .unsetMark("suggestionRemove")
              .run();
          }
        }
      };
    }, [editor]);

    useImperativeHandle(
      ref,
      () => ({
        insertSuggestion,
        insertMention,
        insertInstructionSnippet,
        setContent,
        applyRandomSuggestions,
        hasSuggestions,
        acceptAllSuggestions,
        rejectAllSuggestions,
      }),
      [
        insertSuggestion,
        insertMention,
        insertInstructionSnippet,
        setContent,
        applyRandomSuggestions,
        hasSuggestions,
        acceptAllSuggestions,
        rejectAllSuggestions,
      ]
    );

    const isOnSuggestion = () => {
      return (
        editor?.isActive("suggestionAdd") ||
        editor?.isActive("suggestionRemove")
      );
    };

    const findSuggestionBlockRange = () => {
      if (!editor) return null;
      return getSuggestionBlockRange(editor.state);
    };
    const getSelectionPayload = () => {
      if (!editor) return null;
      const { from, to } = editor.state.selection;
      const selectedText = editor.state.doc.textBetween(from, to, "\n");
      const start = editor.state.doc.textBetween(0, from, "\n").length;
      const end = editor.state.doc.textBetween(0, to, "\n").length;
      return { selectedText, start, end };
    };

    const handleAcceptSuggestion = () => {
      if (!editor) return;

      const range = findSuggestionBlockRange();
      if (!range) return;

      const { start, end, additions } = range;

      // Collect text from additions only (what we want to keep)
      const textToKeep = additions.map((a) => a.text).join("");

      // Replace the entire block with the accepted text
      editor
        .chain()
        .focus()
        .deleteRange({ from: start, to: end })
        .insertContentAt(start, textToKeep)
        .setTextSelection(start + textToKeep.length) // Collapse selection to prevent Ask Copilot from showing
        .run();
    };

    const handleRejectSuggestion = () => {
      if (!editor) return;

      const range = findSuggestionBlockRange();
      if (!range) return;

      const { start, end, removals } = range;

      // Collect text from removals only (what we want to restore)
      const textToKeep = removals.map((r) => r.text).join("");

      // Replace the entire block with the original text
      editor
        .chain()
        .focus()
        .deleteRange({ from: start, to: end })
        .insertContentAt(start, textToKeep)
        .setTextSelection(start + textToKeep.length) // Collapse selection to prevent Ask Copilot from showing
        .run();
    };

    if (!editor) {
      return null;
    }

    const handleToggleLink = () => {
      if (!editor) return;
      const previousUrl = editor.getAttributes("link").href as string | null;
      const url = window.prompt("Enter a URL", previousUrl ?? "");
      if (url === null) return;
      if (url === "") {
        editor.chain().focus().unsetLink().run();
        return;
      }
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: url })
        .run();
    };

    const shouldShowSelectionMenu = () => {
      if (!editor || readOnly) return false;
      if (isOnSuggestion()) return false;
      const { from, to } = editor.state.selection;
      return from !== to;
    };

    const bubbleMenuOptions = scrollContainer
      ? {
          placement: "top" as const,
          offset: 8,
          scrollTarget: scrollContainer,
        }
      : {
          placement: "top" as const,
          offset: 8,
        };

    const appendToTarget = () => scrollContainer ?? document.body;

    return (
      <>
        <style>{`.sparkle-richtextarea ::selection { background-color: #DFE0E2; }`}</style>
        {hasTopBar ? (
          <div
            className={cn(
              "s-flex s-w-full s-flex-col",
              "s-rounded-xl s-border s-bg-muted-background s-transition s-duration-100",
              "s-border-border dark:s-border-border-night",
              "focus-within:s-border-border-focus dark:focus-within:s-border-border-focus-night",
              "focus-within:s-outline-none focus-within:s-ring-2",
              "focus-within:s-ring-highlight/20 dark:focus-within:s-ring-highlight/50",
              "s-min-h-40",
              containerClassName
            )}
          >
            <div
              className={cn(
                "s-sticky s-top-0 s-z-10 s-flex s-items-center s-rounded-t-xl",
                "s-border-b s-border-border dark:s-border-border-night",
                "s-bg-muted-background/80 s-backdrop-blur-sm dark:s-bg-muted-background-night/80",
                topBarClassName
              )}
            >
              {topBar}
            </div>
            <EditorContent editor={editor} />
          </div>
        ) : (
          <EditorContent editor={editor} />
        )}
        <>
          {/* Suggestion accept/reject BubbleMenu */}
          <BubbleMenu
            editor={editor}
            shouldShow={() => isOnSuggestion()}
            appendTo={appendToTarget}
            options={bubbleMenuOptions}
          >
            <HoveringBar size="xs">
              <Button
                icon={XMarkIcon}
                size="xs"
                variant="ghost"
                tooltip="Reject"
                tooltipShortcut="Esc"
                label="Reject"
                onClick={handleRejectSuggestion}
              />
              <HoveringBar.Separator />
              <Button
                icon={CheckIcon}
                size="xs"
                variant="highlight"
                tooltip="Accept"
                tooltipShortcut="Enter"
                label="Accept"
                onClick={handleAcceptSuggestion}
              />
            </HoveringBar>
          </BubbleMenu>
          {/* Formatting BubbleMenu - only show when text is selected and not on suggestion */}
          {showFormattingMenu && (
            <BubbleMenu
              editor={editor}
              shouldShow={shouldShowSelectionMenu}
              appendTo={appendToTarget}
              options={bubbleMenuOptions}
            >
              <HoveringBar size="xs">
                <Button
                  icon={BoldIcon}
                  size="icon"
                  variant={
                    editor.isActive("bold") ? "primary" : "ghost-secondary"
                  }
                  tooltip="Bold"
                  onClick={() => {
                    editor.chain().focus().toggleBold().run();
                  }}
                />
                <Button
                  icon={ItalicIcon}
                  size="icon"
                  variant={
                    editor.isActive("italic") ? "primary" : "ghost-secondary"
                  }
                  tooltip="Italic"
                  onClick={() => {
                    editor.chain().focus().toggleItalic().run();
                  }}
                />
                <HoveringBar.Separator />
                <Button
                  icon={LinkIcon}
                  size="icon"
                  variant={
                    editor.isActive("link") ? "primary" : "ghost-secondary"
                  }
                  tooltip="Link"
                  onClick={handleToggleLink}
                />
              </HoveringBar>
            </BubbleMenu>
          )}
          {/* Ask Copilot BubbleMenu - only show when text is selected and not on suggestion */}
          {showAskCopilotMenu && onAskCopilot && (
            <BubbleMenu
              editor={editor}
              shouldShow={shouldShowSelectionMenu}
              appendTo={appendToTarget}
              options={bubbleMenuOptions}
            >
              <HoveringBar size="xs">
                <Button
                  label="Ask Copilot"
                  size="xs"
                  variant="ghost"
                  icon={SparklesIcon}
                  onClick={() => {
                    const payload = getSelectionPayload();
                    if (payload) {
                      onAskCopilot?.(payload);
                    }
                  }}
                />
                <Button
                  label="Rephrase"
                  icon={PencilSquareIcon}
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    const payload = getSelectionPayload();
                    if (payload) {
                      onAskCopilot?.(payload);
                    }
                  }}
                />
              </HoveringBar>
            </BubbleMenu>
          )}
        </>
      </>
    );
  }
);

RichTextArea.displayName = "RichTextArea";
