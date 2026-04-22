import {
  filterInputBarSkills,
  InputBarSkillSuggestionDropdown,
} from "@app/components/editor/extensions/input_bar/InputBarSkillSuggestionDropdown";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
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
    ((skill: SkillWithoutInstructionsAndToolsType) => void) | undefined
  >;
  refreshKeyRef: RefObject<string>;
  selectedSkillIdsRef: RefObject<Set<string>>;
  skillsRef: RefObject<SkillWithoutInstructionsAndToolsType[]>;
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
        refreshKeyRef: { current: "" },
        selectedSkillIdsRef: { current: new Set<string>() },
        skillsRef: { current: [] as SkillWithoutInstructionsAndToolsType[] },
      };
    },

    addProseMirrorPlugins() {
      const extensionStorage = this.storage;
      let component: ReactRenderer<SlashCommandDropdownRef> | null = null;
      let activeEditorView: EditorView | null = null;
      let activeItemsCount = 0;
      let activeTriggerStart: number | null = null;
      let activeQuery: string | null = null;
      let activeCommand:
        | ((skill: SkillWithoutInstructionsAndToolsType) => void)
        | null = null;
      let activeClientRect: (() => DOMRect | null) | null = null;
      let lastRefreshKey = this.options.refreshKeyRef.current ?? "";

      const getFilteredSkills = (query: string) =>
        filterInputBarSkills({
          query,
          selectedSkillIds:
            this.options.selectedSkillIdsRef.current ?? new Set<string>(),
          skills: this.options.skillsRef.current ?? [],
        });

      const closeSuggestionDropdown = () => {
        if (activeTriggerStart !== null) {
          extensionStorage.dismissedTriggerStart = activeTriggerStart;
        }

        if (activeEditorView) {
          exitSuggestion(activeEditorView, inputBarSkillSuggestionPluginKey);
        }
      };

      const refreshSuggestionDropdown = () => {
        if (!component || activeQuery === null || !activeCommand) {
          return;
        }

        const items = getFilteredSkills(activeQuery);
        activeItemsCount = items.length;

        component.updateProps({
          clientRect: activeClientRect,
          command: activeCommand,
          items,
          onClose: closeSuggestionDropdown,
        });
      };

      return [
        Suggestion<SkillWithoutInstructionsAndToolsType>({
          editor: this.editor,
          char: "/",
          pluginKey: inputBarSkillSuggestionPluginKey,
          allowSpaces: true,
          startOfLine: false,
          items: ({ query }) => getFilteredSkills(query),
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
            return {
              onStart: (props) => {
                activeEditorView = props.editor.view;
                activeItemsCount = props.items.length;
                activeClientRect = props.clientRect ?? null;
                activeCommand = props.command;
                activeQuery = props.query;
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
                activeClientRect = props.clientRect ?? null;
                activeCommand = props.command;
                activeQuery = props.query;
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
                activeClientRect = null;
                activeCommand = null;
                activeQuery = null;
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
              const refreshKey = this.options.refreshKeyRef.current ?? "";
              if (refreshKey !== lastRefreshKey) {
                lastRefreshKey = refreshKey;
                refreshSuggestionDropdown();
              }

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
