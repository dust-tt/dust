import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";
import type { RefAttributes } from "react";

import { EmojiDropdown } from "@app/components/editor/input_bar/EmojiDropdown";
import type {
  EmojiDropdownOnKeyDown,
  EmojiDropdownProps,
} from "@app/components/editor/input_bar/types";

export const emojiPluginKey = new PluginKey("emoji-suggestion");

export function createEmojiSuggestion() {
  return {
    pluginKey: emojiPluginKey,
    char: ":",
    // Emoji shortcodes don't have spaces, so disable allowSpaces
    allowSpaces: false,

    render: () => {
      let component: ReactRenderer<
        EmojiDropdownOnKeyDown,
        EmojiDropdownProps & RefAttributes<EmojiDropdownOnKeyDown>
      > | null = null;

      const closeDropdown = () => {
        component?.element.remove();
        component?.destroy();
        component = null;
      };

      return {
        onStart: (props: SuggestionProps<{ name: string }>) => {
          component = new ReactRenderer(EmojiDropdown, {
            editor: props.editor,
            props: {
              ...props,
              onClose: closeDropdown,
            },
          });

          document.body.appendChild(component.element);
        },

        onUpdate: (props: SuggestionProps<{ name: string }>) => {
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
