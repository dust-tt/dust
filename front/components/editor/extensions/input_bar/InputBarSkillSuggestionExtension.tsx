import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { SKILL_ICON } from "@app/lib/skill";
import type { Range } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import { exitSuggestion, Suggestion } from "@tiptap/suggestion";
import type { RefObject } from "react";

const OPEN_SKILLS_PICKER_ACTION = "open-skills-picker";

const SLASH_COMMANDS: SlashCommand[] = [
  {
    action: OPEN_SKILLS_PICKER_ACTION,
    icon: SKILL_ICON,
    id: "skills",
    label: "Skills",
    tooltip: {
      description: "Add skills to this conversation.",
    },
  },
];

export const inputBarSkillSuggestionPluginKey = new PluginKey(
  "input-bar-skill-suggestion"
);

export function filterInputBarSlashCommands(_query: string) {
  return SLASH_COMMANDS;
}

export function shouldAllowInputBarSkillSlash({
  hasBeenFocused,
  range,
  state,
}: {
  hasBeenFocused: boolean;
  range: Range;
  state: EditorState;
}) {
  if (!hasBeenFocused) {
    return false;
  }

  if (range.from <= 1) {
    return true;
  }

  const previousCharacter = state.doc.textBetween(range.from - 1, range.from);

  return /\s/.test(previousCharacter);
}

export function getInputBarSkillSlashTrigger(state: EditorState): {
  query: string;
  range: Range;
} | null {
  const { empty, from, $from } = state.selection;

  if (!empty) {
    return null;
  }

  const textBefore = $from.parent.textBetween(
    0,
    $from.parentOffset,
    undefined,
    "\ufffc"
  );
  const match = /(?:^|\s)\/([^\n]*)$/.exec(textBefore);

  if (!match) {
    return null;
  }

  const query = match[1];
  const slashLength = query.length + 1;
  const triggerStart = from - slashLength;

  return {
    query,
    range: {
      from: triggerStart,
      to: from,
    },
  };
}

export function getEditorViewRangeRect(view: EditorView, position: number) {
  const coordinates = view.coordsAtPos(position);

  return new DOMRect(
    coordinates.left,
    coordinates.top,
    coordinates.right - coordinates.left,
    coordinates.bottom - coordinates.top
  );
}

function getEditorRangeRect(editor: Editor, position: number) {
  return getEditorViewRangeRect(editor.view, position);
}

export interface InputBarSkillSuggestionExtensionOptions {
  onOpenSkillPicker: (anchorRect: DOMRect | null, query: string) => void;
  shouldAllowSuggestionRef?: RefObject<boolean>;
  suggestion: Partial<SuggestionOptions<SlashCommand>>;
}

export const InputBarSkillSuggestionExtension =
  Extension.create<InputBarSkillSuggestionExtensionOptions>({
    name: "inputBarSkillSuggestion",

    addStorage() {
      return {
        hasBeenFocused: false,
      };
    },

    onFocus() {
      this.storage.hasBeenFocused = true;
    },

    addOptions() {
      return {
        onOpenSkillPicker: () => {},
        shouldAllowSuggestionRef: undefined,
        suggestion: {
          allowSpaces: true,
          char: "/",
          pluginKey: inputBarSkillSuggestionPluginKey,
          startOfLine: false,
        },
      };
    },

    addProseMirrorPlugins() {
      const extensionStorage = this.storage;
      let latestClientRect: (() => DOMRect | null) | null = null;

      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
          allow: ({ state, range }) =>
            (this.options.shouldAllowSuggestionRef?.current ?? true) &&
            shouldAllowInputBarSkillSlash({
              hasBeenFocused: extensionStorage.hasBeenFocused,
              range,
              state,
            }),
          items: ({ query }: { query: string }) =>
            filterInputBarSlashCommands(query),
          command: ({ editor, range, props }) => {
            if (props.action !== OPEN_SKILLS_PICKER_ACTION) {
              return;
            }

            const trigger = getInputBarSkillSlashTrigger(editor.state);
            const anchorRect =
              latestClientRect?.() ?? getEditorRangeRect(editor, range.from);

            exitSuggestion(editor.view, inputBarSkillSuggestionPluginKey);
            this.options.onOpenSkillPicker(anchorRect, trigger?.query ?? "");
          },
          render: () => {
            let component: ReactRenderer<SlashCommandDropdownRef> | null = null;
            let activeEditorView: EditorView | null = null;

            const closeSuggestionDropdown = () => {
              if (!activeEditorView) {
                return;
              }

              exitSuggestion(activeEditorView, inputBarSkillSuggestionPluginKey);
            };

            return {
              onStart: (props: SuggestionProps<SlashCommand>) => {
                latestClientRect = props.clientRect ?? null;
                activeEditorView = props.editor.view;

                component = new ReactRenderer(SlashCommandDropdown, {
                  props: {
                    ...props,
                    onEscapeKeyDown: closeSuggestionDropdown,
                    onInteractOutside: closeSuggestionDropdown,
                  },
                  editor: props.editor,
                });

                if (!props.clientRect) {
                  return;
                }

                document.body.appendChild(component.element);
              },

              onUpdate(props: SuggestionProps<SlashCommand>) {
                latestClientRect = props.clientRect ?? null;
                activeEditorView = props.editor.view;
                component?.updateProps({
                  ...props,
                  onEscapeKeyDown: closeSuggestionDropdown,
                  onInteractOutside: closeSuggestionDropdown,
                });
              },

              onKeyDown(props: { event: KeyboardEvent }) {
                if (props.event.key === "Escape") {
                  closeSuggestionDropdown();
                  return true;
                }

                return component?.ref?.onKeyDown?.(props) ?? false;
              },

              onExit() {
                latestClientRect = null;
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
