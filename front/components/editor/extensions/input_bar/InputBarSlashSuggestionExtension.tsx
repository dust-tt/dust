import { InputBarSlashSuggestionDropdown } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionDropdown";
import type { SlashCommandDropdownRef } from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import type { WorkspaceType } from "@app/types/user";
import { Extension, type Range } from "@tiptap/core";
import { type EditorState, Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { ReactRenderer } from "@tiptap/react";
import { exitSuggestion, Suggestion } from "@tiptap/suggestion";
import type { RefObject } from "react";

import type { InputBarSlashSuggestionCapability } from "./InputBarSlashSuggestionTypes";
export const inputBarSlashSuggestionPluginKey = new PluginKey(
  "inputBarSlashSuggestion"
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

function isAllowedSlashQuery(state: EditorState, range: Range) {
  const text = state.doc.textBetween(range.from, range.to, undefined, "\ufffc");

  if (!text.startsWith("/")) {
    return false;
  }

  return !text.slice(1).startsWith(" ");
}

export interface InputBarSlashSuggestionExtensionOptions {
  owner?: WorkspaceType;
  enabledRef: RefObject<boolean>;
  onSelectRef: RefObject<
    ((capability: InputBarSlashSuggestionCapability) => void) | undefined
  >;
  selectedMCPServerViewIdsRef: RefObject<Set<string>>;
  selectedSkillIdsRef: RefObject<Set<string>>;
}

export const InputBarSlashSuggestionExtension =
  Extension.create<InputBarSlashSuggestionExtensionOptions>({
    name: "inputBarSlashSuggestion",

    addStorage() {
      return {
        hasBeenFocused: false,
        dismissedTriggerStart: null as number | null,
      };
    },

    onFocus() {
      this.storage.hasBeenFocused = true;
    },

    addOptions() {
      return {
        owner: undefined,
        enabledRef: { current: false },
        onSelectRef: { current: undefined },
        selectedMCPServerViewIdsRef: { current: new Set<string>() },
        selectedSkillIdsRef: { current: new Set<string>() },
      };
    },

    addProseMirrorPlugins() {
      const extensionOptions = this.options;
      const extensionStorage = this.storage;

      return [
        Suggestion<InputBarSlashSuggestionCapability>({
          editor: this.editor,
          char: "/",
          pluginKey: inputBarSlashSuggestionPluginKey,
          allowSpaces: true,
          startOfLine: false,
          items: () => [],
          allow: ({ editor, state, range, isActive }) =>
            Boolean(extensionOptions.owner) &&
            Boolean(extensionOptions.enabledRef.current) &&
            extensionStorage.hasBeenFocused &&
            (editor.isFocused || isActive) &&
            extensionStorage.dismissedTriggerStart !== range.from &&
            isAllowedSlashQuery(state, range),
          shouldShow: ({ transaction }) =>
            !transaction.getMeta("paste") &&
            transaction.getMeta("uiEvent") !== "paste",
          command: ({ editor, range, props }) => {
            extensionStorage.dismissedTriggerStart = null;
            editor.chain().focus().deleteRange(range).run();
            extensionOptions.onSelectRef.current?.(props);
          },
          render: () => {
            let component: ReactRenderer<SlashCommandDropdownRef> | null = null;
            let activeEditorView: EditorView | null = null;
            let activeTriggerStart: number | null = null;

            const closeSuggestionDropdown = () => {
              if (activeTriggerStart !== null) {
                extensionStorage.dismissedTriggerStart = activeTriggerStart;
              }

              if (activeEditorView) {
                exitSuggestion(
                  activeEditorView,
                  inputBarSlashSuggestionPluginKey
                );
              }
            };

            return {
              onStart: (props) => {
                const owner = extensionOptions.owner;

                if (!owner || !props.clientRect) {
                  return;
                }

                activeEditorView = props.editor.view;
                component = new ReactRenderer(InputBarSlashSuggestionDropdown, {
                  props: {
                    ...props,
                    onClose: closeSuggestionDropdown,
                    owner,
                    selectedMCPServerViewIdsRef:
                      extensionOptions.selectedMCPServerViewIdsRef,
                    selectedSkillIdsRef: extensionOptions.selectedSkillIdsRef,
                  },
                  editor: props.editor,
                });
                activeTriggerStart = props.range.from;

                document.body.appendChild(component.element);
              },

              onUpdate(props) {
                const owner = extensionOptions.owner;

                if (!owner) {
                  return;
                }

                activeEditorView = props.editor.view;
                activeTriggerStart = props.range.from;
                component?.updateProps({
                  ...props,
                  onClose: closeSuggestionDropdown,
                  owner,
                  selectedMCPServerViewIdsRef:
                    extensionOptions.selectedMCPServerViewIdsRef,
                  selectedSkillIdsRef: extensionOptions.selectedSkillIdsRef,
                });
              },

              onKeyDown: ({ event }) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeSuggestionDropdown();
                  return true;
                }

                return component?.ref?.onKeyDown?.({ event }) ?? false;
              },

              onExit() {
                activeEditorView = null;
                activeTriggerStart = null;
                component?.element?.remove();
                component?.destroy();
                component = null;
              },
            };
          },
        }),
        new Plugin({
          key: new PluginKey("inputBarSlashSuggestionCleanup"),
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
