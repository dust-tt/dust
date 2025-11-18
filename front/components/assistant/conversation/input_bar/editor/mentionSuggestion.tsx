import { PluginKey } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { ReactRenderer } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";
import type { RefAttributes } from "react";

import { MentionDropdown } from "@app/components/assistant/conversation/input_bar/editor/MentionDropdown";
import type {
  MentionDropdownOnKeyDown,
  MentionDropdownProps,
} from "@app/components/assistant/conversation/input_bar/editor/types";
import { filterMentionSuggestions } from "@app/lib/mentions/editor/suggestion";
import type { RichMention } from "@app/types";
export const mentionPluginKey = new PluginKey("mention-suggestion");

export function createMentionSuggestion() {
  return {
    pluginKey: mentionPluginKey,
    // Ensure queries can contain spaces (e.g., @Sales Team → decomposes to
    // text and keeps the dropdown active over the full label).
    allowSpaces: true,

    items: ({
      editor,
      query,
    }: {
      editor: Editor;
      query: string;
    }): RichMention[] => {
      return filterMentionSuggestions(
        query,
        editor.storage.MentionStorage.suggestions.suggestions,
        editor.storage.MentionStorage.suggestions.fallbackSuggestions
      );
    },

    render: () => {
      let component: ReactRenderer<
        MentionDropdownOnKeyDown,
        MentionDropdownProps & RefAttributes<MentionDropdownOnKeyDown>
      > | null = null;

      const closeDropdown = () => {
        // Just destroy the component to close the dropdown.
        component?.element.remove();
        component?.destroy();
        component = null;
      };

      return {
        onStart: (props: SuggestionProps<RichMention, RichMention>) => {
          component = new ReactRenderer(MentionDropdown, {
            editor: props.editor,
            props: {
              ...props,
              onClose: closeDropdown,
            },
          });

          document.body.appendChild(component.element);
        },

        onUpdate: (props: SuggestionProps<RichMention>) => {
          component?.updateProps({
            ...props,
            onClose: closeDropdown,
          });
        },

        onKeyDown: (props: SuggestionKeyDownProps) => {
          if (!component || !component.ref) {
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
