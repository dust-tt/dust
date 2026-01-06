import { BookOpenIcon } from "@dust-tt/sparkle";
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import { Suggestion } from "@tiptap/suggestion";

import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "./SlashCommandDropdown";
import { SlashCommandDropdown } from "./SlashCommandDropdown";

const slashCommandPluginKey = new PluginKey("slashCommand");

const INSERT_KNOWLEDGE_NODE_ACTION = "insert-knowledge-node";

// Define available slash commands.
const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "attach-knowledge",
    label: "Attach knowledge",
    description: "Search and attach knowledge to your skill",
    action: INSERT_KNOWLEDGE_NODE_ACTION,
    icon: BookOpenIcon,
  },
];

export interface SlashCommandExtensionOptions {
  suggestion: Partial<SuggestionOptions>;
}

export const SlashCommandExtension =
  Extension.create<SlashCommandExtensionOptions>({
    name: "slashCommand",

    addOptions() {
      return {
        suggestion: {
          char: "/",
          pluginKey: slashCommandPluginKey,
          allowSpaces: false,
          startOfLine: false,
          items: ({ query }: { query: string }) => {
            if (!query || query.length === 0) {
              return SLASH_COMMANDS;
            }

            return SLASH_COMMANDS.filter(
              (command) =>
                command.label.toLowerCase().includes(query.toLowerCase()) ||
                command.description.toLowerCase().includes(query.toLowerCase())
            );
          },
        },
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
          command: ({ editor, range, props }) => {
            if (props.action === INSERT_KNOWLEDGE_NODE_ACTION) {
              editor
                .chain()
                .focus()
                .deleteRange(range)
                .insertKnowledgeNode()
                .run();
            }
          },
          render: () => {
            let component: ReactRenderer<SlashCommandDropdownRef> | null = null;

            return {
              onStart: (props: SuggestionProps) => {
                component = new ReactRenderer(SlashCommandDropdown, {
                  props,
                  editor: props.editor,
                });

                if (!props.clientRect) {
                  return;
                }

                document.body.appendChild(component.element);
              },

              onUpdate(props: SuggestionProps) {
                component?.updateProps(props);

                if (!props.clientRect) {
                  return;
                }
              },

              onKeyDown(props: { event: KeyboardEvent }) {
                if (props.event.key === "Escape") {
                  component?.element?.remove();
                  component?.destroy();
                  component = null;
                  return true;
                }

                return component?.ref?.onKeyDown?.(props) ?? false;
              },

              onExit() {
                component?.element?.remove();
                component?.destroy();
                component = null;
              },
            };
          },
        }),
      ];
    },
  });
