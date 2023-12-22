import { ReactRenderer } from "@tiptap/react";
import tippy from "tippy.js";

import { MentionList } from "@app/components/assistant/conversation/input_bar/editor/MentionList";

export interface EditorSuggestion {
  id: string;
  label: string;
  pictureUrl: string;
}

const SUGGESTION_DISPLAY_LIMIT = 7;

export function makeGetAssistantSuggestions(suggestions: EditorSuggestion[]) {
  return {
    // TODO: Consider refactoring to eliminate the dependency on tippy.
    items: ({ query }: { query: string }) => {
      return suggestions
        .filter((item) =>
          item.label.toLowerCase().startsWith(query.toLowerCase())
        )
        .slice(0, SUGGESTION_DISPLAY_LIMIT);
    },

    render: () => {
      let reactRenderer: any;
      let popup: any;

      return {
        onStart: (props: any) => {
          if (!props.clientRect) {
            return;
          }

          reactRenderer = new ReactRenderer(MentionList, {
            props,
            editor: props.editor,
          });

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: reactRenderer.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },

        onUpdate(props: any) {
          reactRenderer.updateProps(props);

          if (!props.clientRect) {
            return;
          }

          popup[0].setProps({
            getReferenceClientRect: props.clientRect,
          });
        },

        onKeyDown(props: any) {
          if (props.event.key === "Escape") {
            popup[0].hide();

            return true;
          }

          return reactRenderer.ref?.onKeyDown(props);
        },

        onExit() {
          popup[0].destroy();
          reactRenderer.destroy();
        },
      };
    },
  };
}
