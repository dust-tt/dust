import { MentionDropdown } from "@app/components/editor/input_bar/MentionDropdown";
import type {
  MentionDropdownOnKeyDown,
  MentionDropdownProps,
} from "@app/components/editor/input_bar/types";
import type { RichMention } from "@app/types/assistant/mentions";
import type { WorkspaceType } from "@app/types/user";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";
import type { RefAttributes } from "react";

export const mentionPluginKey = new PluginKey("mention-suggestion");

export function createMentionSuggestion({
  owner,
  conversationId,
  spaceId,
  select,
  includeCurrentUser = false,
  onAgentSelect,
  singleAgentInputEnabled,
}: {
  owner: WorkspaceType;
  conversationId?: string | null;
  spaceId?: string;
  includeCurrentUser?: boolean;
  select: {
    agents: boolean;
    users: boolean;
  };
  onAgentSelect?: (mention: RichMention) => void;
  singleAgentInputEnabled?: boolean;
}) {
  return {
    pluginKey: mentionPluginKey,
    // Ensure queries can contain spaces (e.g., @Sales Team → decomposes to
    // text and keeps the dropdown active over the full label).
    allowSpaces: true,

    // Override the default command to intercept agent mentions and redirect them
    // to the picker button instead of inserting them into the editor.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    command: ({ editor, range, props }: any) => {
      const mention = props as RichMention;
      if (
        mention.type === "agent" &&
        singleAgentInputEnabled &&
        onAgentSelect
      ) {
        // Delete the @query text without inserting a mention node.
        editor.chain().focus().deleteRange(range).run();
        onAgentSelect(mention);
      } else {
        // Default: insert mention node (user mentions).
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({ type: "mention", attrs: props })
          .insertContent(" ")
          .run();
      }
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
              owner,
              conversationId,
              spaceId,
              includeCurrentUser,
              onClose: closeDropdown,
              select,
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
            spaceId,
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
