import type { Range } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";
import type { MutableRefObject, RefAttributes } from "react";

import { SkillDropdown } from "@app/components/editor/input_bar/SkillDropdown";
import type {
  SkillDropdownOnKeyDown,
  SkillDropdownProps,
} from "@app/components/editor/input_bar/types";
import type { WorkspaceType } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

export const skillPluginKey = new PluginKey("skill-suggestion");

export function createSkillSuggestion({
  owner,
  onSkillSelectRef,
  selectedSkillsRef,
}: {
  owner: WorkspaceType;
  onSkillSelectRef: MutableRefObject<(skill: SkillType) => void>;
  selectedSkillsRef: MutableRefObject<SkillType[]>;
}) {
  return {
    pluginKey: skillPluginKey,
    char: "/",
    allowSpaces: false,

    // Only trigger when `/` is preceded by whitespace or at the start of text.
    allow: ({ state, range }: { state: EditorState; range: Range }) => {
      const from = range.from;
      if (from <= 1) {
        return true;
      }
      const charBefore = state.doc.textBetween(from - 1, from);
      return /\s/.test(charBefore);
    },

    command: ({
      editor,
      range,
      props: skill,
    }: {
      editor: { chain: () => ReturnType<typeof Object.create> };
      range: Range;
      props: SkillType;
    }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent(skill.name)
        .run();
      onSkillSelectRef.current(skill);
    },

    render: () => {
      let component: ReactRenderer<
        SkillDropdownOnKeyDown,
        SkillDropdownProps & RefAttributes<SkillDropdownOnKeyDown>
      > | null = null;

      const closeDropdown = () => {
        component?.element.remove();
        component?.destroy();
        component = null;
      };

      return {
        onStart: (props: SuggestionProps<SkillType>) => {
          component = new ReactRenderer(SkillDropdown, {
            editor: props.editor,
            props: {
              ...props,
              owner,
              selectedSkillsRef,
              onClose: closeDropdown,
            },
          });

          document.body.appendChild(component.element);
        },

        onUpdate: (props: SuggestionProps<SkillType>) => {
          component?.updateProps({
            ...props,
            owner,
            selectedSkillsRef,
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
