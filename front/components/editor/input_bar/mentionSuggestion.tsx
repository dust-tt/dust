import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";
import type { RefAttributes } from "react";

import { MentionDropdown } from "@app/components/editor/input_bar/MentionDropdown";
import type {
  MentionDropdownOnKeyDown,
  MentionDropdownProps,
} from "@app/components/editor/input_bar/types";
import type { RichMention, WorkspaceType } from "@app/types";

export const mentionPluginKey = new PluginKey("mention-suggestion");

export function createMentionSuggestion({
  owner,
  conversationId,
  preferredAgentId,
  userMentionsEnabled,
}: {
  owner: WorkspaceType;
  conversationId: string | null;
  preferredAgentId?: string | null;
  userMentionsEnabled?: boolean;
}) {
  return {
    pluginKey: mentionPluginKey,
    // Ensure queries can contain spaces (e.g., @Sales Team → decomposes to
    // text and keeps the dropdown active over the full label).
    allowSpaces: true,

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
              owner,
              conversationId,
              preferredAgentId,
              userMentionsEnabled,
              onClose: closeDropdown,
            },
          });

          document.body.appendChild(component.element);
        },

        onUpdate: (props: SuggestionProps<RichMention>) => {
          component?.updateProps({
            ...props,
            onClose: closeDropdown,
            owner,
            conversationId,
            preferredAgentId,
            userMentionsEnabled,
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
