import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";

import type {
  KnowledgeDropdownOnKeyDown,
  KnowledgeDropdownProps,
} from "@app/lib/mentions/ui/KnowledgeDropdown";
import { KnowledgeDropdown } from "@app/lib/mentions/ui/KnowledgeDropdown";

const knowledgePluginKey = new PluginKey("knowledgeSuggestion");

export function createKnowledgeSuggestion(): Omit<SuggestionOptions, "editor"> {
  return {
    pluginKey: knowledgePluginKey,
    allowSpaces: false,

    items: async ({ query }) => {
      // Simple attachment options
      const allOptions = [
        {
          id: "attach-knowledge",
          label: "Attach knowledge 2",
          description: "Search and attach knowledge to your message",
          action: "insert-knowledge-node",
        },
        {
          id: "attach-file",
          label: "Attach file",
          description: "Upload and attach a file",
          action: "open-file-upload",
        },
      ];

      if (!query || query.length === 0) {
        return allOptions;
      }

      return allOptions.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.description.toLowerCase().includes(query.toLowerCase())
      );
    },

    command: ({ editor, range, props }) => {
      if (props.action === "insert-knowledge-node") {
        // Insert a knowledge node that starts in placeholder mode
        editor.chain().focus().deleteRange(range).insertKnowledgeNode().run();
      } else if (props.action === "open-file-upload") {
        // For now, just insert placeholder text
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent("[File Upload]")
          .run();
      }
    },

    render: () => {
      let component: ReactRenderer<
        KnowledgeDropdownOnKeyDown,
        KnowledgeDropdownProps
      > | null = null;

      const closeDropdown = () => {
        component?.element.remove();
        component?.destroy();
        component = null;
      };

      return {
        onStart: (props: SuggestionProps) => {
          component = new ReactRenderer(KnowledgeDropdown, {
            editor: props.editor,
            props: {
              ...props,
              onClose: closeDropdown,
            },
          });

          document.body.appendChild(component.element);
        },

        onUpdate: (props: SuggestionProps) => {
          component?.updateProps({
            ...props,
            onClose: closeDropdown,
          });
        },

        onKeyDown: (props: { event: KeyboardEvent }) => {
          if (!component?.ref) {
            return false;
          }

          if (props.event.key === "Escape") {
            closeDropdown();
            return true;
          }

          return component.ref.onKeyDown(props);
        },

        onExit: () => {
          component?.element.remove();
          component?.destroy();
        },
      };
    },
  };
}
