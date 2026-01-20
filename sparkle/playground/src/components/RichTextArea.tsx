import "tippy.js/dist/tippy.css";

import { Extension, mergeAttributes, Mark } from "@tiptap/core";
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
  useImperativeHandle,
  useMemo,
  useState,
} from "react";

import {
  Avatar,
  Button,
  CheckIcon,
  HoveringBar,
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
          "s-rounded s-px-0.5",
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
          "s-rounded s-px-0.5 s-line-through",
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
        "s-bg-highlight-100 dark:s-bg-highlight-100 s-text-highlight-800 dark:s-text-highlight-800-night",
    },
    {
      kind: "add",
      state: "unselected",
      className:
        "s-bg-highlight-50 dark:s-bg-highlight-50-night s-text-muted-foreground dark:s-text-muted-foreground-night",
    },
    {
      kind: "remove",
      state: "selected",
      className: "s-bg-warning-100 s-text-warning-800 dark:s-text-warning-800-night",
    },
    {
      kind: "remove",
      state: "unselected",
      className:
        "s-bg-warning-50 dark:s-bg-muted-background-night s-text-muted-foreground dark:s-text-muted-foreground-night",
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
  setContent: (text: string) => void;
  applyRandomSuggestions: (changes: string[]) => void;
  hasSuggestions: () => boolean;
  acceptAllSuggestions: () => void;
  rejectAllSuggestions: () => void;
};

type RichTextAreaProps = {
  className?: string;
  placeholder?: string;
  onAskCopilot?: (selectedText: string) => void;
  scrollContainer?: HTMLElement | null;
  readOnly?: boolean;
  defaultValue?: string;
};

export const RichTextArea = forwardRef<RichTextAreaHandle, RichTextAreaProps>(
  ({ className, placeholder, onAskCopilot, scrollContainer, readOnly, defaultValue }, ref) => {
    const editor = useEditor({
      extensions: [
        StarterKit,
        mentionExtension,
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
          class: cn(baseEditorClassName, "sparkle-richtextarea", className),
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
            const length = Math.max(1, Math.floor(Math.random() * maxLength) + 1);
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
        setContent,
        applyRandomSuggestions,
        hasSuggestions,
        acceptAllSuggestions,
        rejectAllSuggestions,
      }),
      [
        insertSuggestion,
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

    return (
      <>
        <style>{`.sparkle-richtextarea ::selection { background-color: #DFE0E2; }`}</style>
        <EditorContent editor={editor} />
        {scrollContainer && (
          <>
            {/* Suggestion accept/reject BubbleMenu */}
            <BubbleMenu
              editor={editor}
              shouldShow={() => isOnSuggestion()}
              appendTo={() => scrollContainer}
              options={{
                placement: "top",
                offset: 8,
                scrollTarget: scrollContainer,
              }}
            >
              <HoveringBar size="xs">
                <Button
                  icon={XMarkIcon}
                  size="xs"
                  variant="ghost"
                  tooltip="Reject"
                  onClick={handleRejectSuggestion}
                />
                <HoveringBar.Separator />
                <Button
                  icon={CheckIcon}
                  size="xs"
                  variant="highlight"
                  tooltip="Accept"
                  onClick={handleAcceptSuggestion}
                />
              </HoveringBar>
            </BubbleMenu>
            {/* Ask Copilot BubbleMenu - only show when text is selected and not on suggestion */}
            <BubbleMenu
              editor={editor}
              shouldShow={() => {
                const { from, to } = editor.state.selection;
                const hasSelection = from !== to;
                return hasSelection && !isOnSuggestion();
              }}
              appendTo={() => scrollContainer}
              options={{
                placement: "top",
                offset: 8,
                scrollTarget: scrollContainer,
              }}
            >
              <HoveringBar size="sm">
                <Button
                  label="Ask Copilot"
                  size="sm"
                  variant="ghost"
                  icon={SparklesIcon}
                  onClick={() => {
                    const { from, to } = editor.state.selection;
                    const selectedText = editor.state.doc.textBetween(from, to, "\n");
                    onAskCopilot?.(selectedText);
                  }}
                />
                <Button
                  label="Correct"
                  size="sm"
                  variant="ghost"
                  icon={SparklesIcon}
                  onClick={() => {
                    const { from, to } = editor.state.selection;
                    const selectedText = editor.state.doc.textBetween(from, to, "\n");
                    onAskCopilot?.(selectedText);
                  }}
                />
              </HoveringBar>
            </BubbleMenu>
          </>
        )}
      </>
    );
  }
);

RichTextArea.displayName = "RichTextArea";
