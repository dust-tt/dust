import {
  filterInputBarSkills,
  InputBarSkillSuggestionDropdown,
} from "@app/components/editor/extensions/input_bar/InputBarSkillSuggestionDropdown";
import type { SkillWithoutToolsType } from "@app/types/assistant/skill_configuration";
import { Extension } from "@tiptap/core";
import { type EditorState, Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { ReactRenderer } from "@tiptap/react";
import { exitSuggestion, Suggestion } from "@tiptap/suggestion";
import type { RefObject } from "react";

import type { SlashCommandDropdownRef } from "../skill_builder/SlashCommandDropdown";

export const inputBarSkillSuggestionPluginKey = new PluginKey(
  "inputBarSkillSuggestion"
);

function hasSlashCharacterAtPosition(state: EditorState, position: number) {
  const docSize = state.doc.content.size;

  if (position < 1 || position > docSize) {
    return false;
  }

  return (
    state.doc.textBetween(
      position,
      Math.min(position + 1, docSize + 1),
      undefined,
      "\ufffc"
    ) === "/"
  );
}

export interface InputBarSkillSuggestionExtensionOptions {
  enabledRef: RefObject<boolean>;
  onSkillSelectRef: RefObject<
    ((skill: SkillWithoutToolsType) => void) | undefined
  >;
  selectedSkillIdsRef: RefObject<Set<string>>;
  skillsRef: RefObject<SkillWithoutToolsType[]>;
}

export const InputBarSkillSuggestionExtension =
  Extension.create<InputBarSkillSuggestionExtensionOptions>({
    name: "inputBarSkillSuggestion",

    addStorage() {
      return {
        dismissedTriggerStart: null as number | null,
      };
    },

    addOptions() {
      return {
        enabledRef: { current: false },
        onSkillSelectRef: { current: undefined },
        selectedSkillIdsRef: { current: new Set<string>() },
        skillsRef: { current: [] as SkillWithoutToolsType[] },
      };
    },

    addProseMirrorPlugins() {
      const extensionStorage = this.storage;

      return [
        Suggestion<SkillWithoutToolsType>({
          editor: this.editor,
          char: "/",
          pluginKey: inputBarSkillSuggestionPluginKey,
          allowSpaces: true,
          startOfLine: false,
          items: ({ query }) =>
            filterInputBarSkills({
              query,
              selectedSkillIds:
                this.options.selectedSkillIdsRef.current ?? new Set<string>(),
              skills: this.options.skillsRef.current ?? [],
            }),
          allow: ({ editor, range }) =>
            Boolean(this.options.enabledRef.current) &&
            editor.isFocused &&
            extensionStorage.dismissedTriggerStart !== range.from,
          command: ({ editor, range, props }) => {
            extensionStorage.dismissedTriggerStart = null;
            editor.chain().focus().deleteRange(range).run();
            this.options.onSkillSelectRef.current?.(props);
          },
          render: () => {
            let component: ReactRenderer<SlashCommandDropdownRef> | null = null;
            let activeEditorView: EditorView | null = null;
            let activeItemsCount = 0;
            let activeTriggerStart: number | null = null;

            const closeSuggestionDropdown = () => {
              if (activeTriggerStart !== null) {
                extensionStorage.dismissedTriggerStart = activeTriggerStart;
              }

              if (activeEditorView) {
                exitSuggestion(
                  activeEditorView,
                  inputBarSkillSuggestionPluginKey
                );
              }
            };

            return {
              onStart: (props) => {
                activeEditorView = props.editor.view;
                activeItemsCount = props.items.length;
                activeTriggerStart = props.range.from;
                component = new ReactRenderer(InputBarSkillSuggestionDropdown, {
                  props: {
                    ...props,
                    onClose: closeSuggestionDropdown,
                  },
                  editor: props.editor,
                });

                if (!props.clientRect) {
                  return;
                }

                document.body.appendChild(component.element);
              },

              onUpdate(props) {
                activeEditorView = props.editor.view;
                activeItemsCount = props.items.length;
                activeTriggerStart = props.range.from;
                component?.updateProps({
                  ...props,
                  onClose: closeSuggestionDropdown,
                });
              },

              onKeyDown: ({ event }) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeSuggestionDropdown();
                  return true;
                }

                if (event.key === "Enter" && activeItemsCount === 0) {
                  event.preventDefault();
                  return true;
                }

                return component?.ref?.onKeyDown?.({ event }) ?? false;
              },

              onExit() {
                activeEditorView = null;
                activeItemsCount = 0;
                activeTriggerStart = null;
                component?.element?.remove();
                component?.destroy();
                component = null;
              },
            };
          },
        }),
        new Plugin({
          key: new PluginKey("inputBarSkillSuggestionCleanup"),
          view: () => ({
            update: (view) => {
              const dismissedTriggerStart =
                extensionStorage.dismissedTriggerStart;

              if (
                dismissedTriggerStart !== null &&
                !hasSlashCharacterAtPosition(view.state, dismissedTriggerStart)
              ) {
                extensionStorage.dismissedTriggerStart = null;
              }
            },
          }),
        }),
      ];
    },
  });
