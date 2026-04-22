import { InputBarCapabilitySuggestionDropdown } from "@app/components/editor/extensions/input_bar/InputBarCapabilitySuggestionDropdown";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { WorkspaceType } from "@app/types/user";
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { ReactRenderer } from "@tiptap/react";
import { exitSuggestion, Suggestion } from "@tiptap/suggestion";
import type { RefObject } from "react";

import type { SlashCommandDropdownRef } from "../skill_builder/SlashCommandDropdown";

export const inputBarCapabilitySuggestionPluginKey = new PluginKey(
  "inputBarCapabilitySuggestion"
);

export interface InputBarCapabilitySuggestionExtensionOptions {
  owner: WorkspaceType;
  enabledRef: RefObject<boolean>;
  onSkillSelectRef: RefObject<
    ((skill: SkillWithoutInstructionsAndToolsType) => void) | undefined
  >;
  selectedSkillIdsRef: RefObject<Set<string>>;
}

export const InputBarCapabilitySuggestionExtension =
  Extension.create<InputBarCapabilitySuggestionExtensionOptions>({
    name: "inputBarCapabilitySuggestion",

    addOptions() {
      return {
        owner: {} as WorkspaceType,
        enabledRef: { current: false },
        onSkillSelectRef: { current: undefined },
        selectedSkillIdsRef: { current: new Set<string>() },
      };
    },

    addProseMirrorPlugins() {
      const extensionOptions = this.options;

      return [
        Suggestion<SkillWithoutInstructionsAndToolsType>({
          editor: this.editor,
          char: "/",
          pluginKey: inputBarCapabilitySuggestionPluginKey,
          allowSpaces: true,
          startOfLine: false,
          items: () => [],
          allow: ({ editor }) =>
            Boolean(extensionOptions.enabledRef.current) && editor.isFocused,
          command: ({ editor, range, props }) => {
            editor.chain().focus().deleteRange(range).run();
            extensionOptions.onSkillSelectRef.current?.(props);
          },
          render: () => {
            let component: ReactRenderer<SlashCommandDropdownRef> | null = null;
            let activeEditorView: EditorView | null = null;

            const closeSuggestionDropdown = () => {
              if (activeEditorView) {
                exitSuggestion(
                  activeEditorView,
                  inputBarCapabilitySuggestionPluginKey
                );
              }
            };

            return {
              onStart: (props) => {
                activeEditorView = props.editor.view;
                component = new ReactRenderer(
                  InputBarCapabilitySuggestionDropdown,
                  {
                  props: {
                    ...props,
                    onClose: closeSuggestionDropdown,
                    owner: extensionOptions.owner,
                    selectedSkillIdsRef: extensionOptions.selectedSkillIdsRef,
                  },
                  editor: props.editor,
                  }
                );

                if (!props.clientRect) {
                  return;
                }

                document.body.appendChild(component.element);
              },

              onUpdate(props) {
                activeEditorView = props.editor.view;
                component?.updateProps({
                  ...props,
                  onClose: closeSuggestionDropdown,
                  owner: extensionOptions.owner,
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
                component?.element?.remove();
                component?.destroy();
                component = null;
              },
            };
          },
        }),
      ];
    },
  });
