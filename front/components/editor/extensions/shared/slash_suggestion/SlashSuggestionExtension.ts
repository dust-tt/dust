import type { SlashCommandDropdownRef } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { hasSlashCharacterAtPosition } from "@app/components/editor/extensions/shared/slash_suggestion/slashSuggestionUtils";
import type { Editor, Range } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { ReactRenderer } from "@tiptap/react";
import { exitSuggestion, Suggestion } from "@tiptap/suggestion";
import type { ComponentType } from "react";

export interface SlashSuggestionBaseStorage {
  hasBeenFocused: boolean;
}

export interface SlashSuggestionAllowContext<
  Options,
  Storage extends SlashSuggestionBaseStorage,
> {
  editor: Editor;
  isActive: boolean;
  options: Options;
  range: Range;
  state: EditorState;
  storage: Storage;
}

export interface SlashSuggestionShouldShowContext<
  Options,
  Storage extends SlashSuggestionBaseStorage,
> {
  editor: Editor;
  options: Options;
  range: Range;
  storage: Storage;
  transaction: Transaction;
}

export interface SlashSuggestionCommandContext<
  Options,
  Storage extends SlashSuggestionBaseStorage,
  Item,
> {
  editor: Editor;
  options: Options;
  props: Item;
  range: Range;
  storage: Storage;
}

export interface SlashSuggestionDropdownContext<
  Options,
  Storage extends SlashSuggestionBaseStorage,
  Item,
> {
  options: Options;
  props: {
    clientRect?: (() => DOMRect | null) | null;
    command: (item: Item) => void;
    editor: Editor;
    items: Item[];
    query: string;
    range: Range;
  };
  storage: Storage;
}

export interface CreateSlashSuggestionExtensionConfig<
  Options extends object,
  Storage extends SlashSuggestionBaseStorage,
  Item,
> {
  allow: (ctx: SlashSuggestionAllowContext<Options, Storage>) => boolean;
  cleanupPluginKeyName: string;
  command: (ctx: SlashSuggestionCommandContext<Options, Storage, Item>) => void;
  createStorage: () => Storage;
  defaultOptions: Options;
  DropdownComponent: ComponentType<any>;
  items: (ctx: {
    editor: Editor;
    options: Options;
    query: string;
    storage: Storage;
  }) => Item[];
  mapDropdownProps: (
    ctx: SlashSuggestionDropdownContext<Options, Storage, Item>
  ) => Record<string, unknown>;
  name: string;
  notifyActiveChange?: (active: boolean, options: Options) => void;
  onDropdownClose?: (ctx: {
    storage: Storage;
    triggerStart: number | null;
  }) => void;
  pluginKey: PluginKey;
  preventEscapeDefault?: boolean;
  shouldMountDropdown?: (
    ctx: SlashSuggestionDropdownContext<Options, Storage, Item>
  ) => boolean;
  shouldAppendDropdown?: (
    ctx: SlashSuggestionDropdownContext<Options, Storage, Item>
  ) => boolean;
  shouldShow?: (
    ctx: SlashSuggestionShouldShowContext<Options, Storage>
  ) => boolean;
  /** Storage field reset by the cleanup plugin once its trigger slash is removed. */
  triggerCleanupStorageKey?: keyof Storage & string;
  addCommands?: (ctx: {
    editor: Editor;
    options: Options;
    storage: Storage;
  }) => Record<string, unknown>;
}

export function createSlashSuggestionExtension<
  Options extends object,
  Storage extends SlashSuggestionBaseStorage,
  Item,
>({
  name,
  pluginKey,
  cleanupPluginKeyName,
  triggerCleanupStorageKey,
  DropdownComponent,
  defaultOptions,
  createStorage,
  addCommands,
  allow,
  shouldShow,
  items,
  command,
  mapDropdownProps,
  shouldMountDropdown,
  shouldAppendDropdown,
  notifyActiveChange,
  onDropdownClose,
  preventEscapeDefault = false,
}: CreateSlashSuggestionExtensionConfig<Options, Storage, Item>) {
  return Extension.create<Options, Storage>({
    name,

    addStorage() {
      return createStorage();
    },

    onFocus() {
      this.storage.hasBeenFocused = true;
    },

    addOptions() {
      return defaultOptions as Options;
    },

    ...(addCommands
      ? {
          addCommands() {
            return addCommands({
              editor: this.editor,
              options: this.options,
              storage: this.storage,
            }) as ReturnType<NonNullable<Extension["config"]["addCommands"]>>;
          },
        }
      : {}),

    addProseMirrorPlugins() {
      const extensionOptions = this.options;
      const extensionStorage = this.storage;

      return [
        Suggestion<Item>({
          editor: this.editor,
          char: "/",
          pluginKey,
          allowSpaces: true,
          startOfLine: false,
          allow: ({ editor, state, range, isActive }) =>
            Boolean(
              allow({
                editor,
                state,
                range,
                isActive: isActive ?? false,
                options: extensionOptions,
                storage: extensionStorage,
              })
            ),
          ...(shouldShow
            ? {
                shouldShow: ({ editor, range, transaction }) =>
                  Boolean(
                    shouldShow({
                      editor,
                      range,
                      transaction,
                      options: extensionOptions,
                      storage: extensionStorage,
                    })
                  ),
              }
            : {}),
          items: ({ editor, query }) =>
            items({
              editor,
              query,
              options: extensionOptions,
              storage: extensionStorage,
            }),
          command: ({ editor, range, props }) => {
            command({
              editor,
              range,
              props,
              options: extensionOptions,
              storage: extensionStorage,
            });
          },
          render: () => {
            let component: ReactRenderer<SlashCommandDropdownRef> | null = null;
            let activeEditorView: EditorView | null = null;
            let activeTriggerStart: number | null = null;

            const closeSuggestionDropdown = () => {
              onDropdownClose?.({
                storage: extensionStorage,
                triggerStart: activeTriggerStart,
              });

              if (activeEditorView) {
                exitSuggestion(activeEditorView, pluginKey);
              }
            };

            const buildDropdownContext = (
              props: SlashSuggestionDropdownContext<
                Options,
                Storage,
                Item
              >["props"]
            ): SlashSuggestionDropdownContext<Options, Storage, Item> => ({
              props,
              options: extensionOptions,
              storage: extensionStorage,
            });

            return {
              onStart: (props) => {
                const dropdownContext = buildDropdownContext(props);

                if (
                  shouldMountDropdown &&
                  !shouldMountDropdown(dropdownContext)
                ) {
                  return;
                }

                notifyActiveChange?.(true, extensionOptions);
                activeEditorView = props.editor.view;
                component = new ReactRenderer(DropdownComponent, {
                  props: {
                    ...props,
                    ...mapDropdownProps(dropdownContext),
                    onClose: closeSuggestionDropdown,
                  },
                  editor: props.editor,
                });
                activeTriggerStart = props.range.from;

                if (
                  !shouldAppendDropdown ||
                  shouldAppendDropdown(dropdownContext)
                ) {
                  document.body.appendChild(component.element);
                }
              },

              onUpdate(props) {
                const dropdownContext = buildDropdownContext(props);

                if (
                  shouldMountDropdown &&
                  !shouldMountDropdown(dropdownContext)
                ) {
                  return;
                }

                activeEditorView = props.editor.view;
                activeTriggerStart = props.range.from;
                component?.updateProps({
                  ...props,
                  ...mapDropdownProps(dropdownContext),
                  onClose: closeSuggestionDropdown,
                });
              },

              onKeyDown: ({ event }) => {
                const handled = component?.ref?.onKeyDown?.({ event }) ?? false;
                if (handled) {
                  return true;
                }

                if (event.key === "Escape") {
                  if (preventEscapeDefault) {
                    event.preventDefault();
                  }
                  closeSuggestionDropdown();
                  return true;
                }

                return false;
              },

              onExit() {
                notifyActiveChange?.(false, extensionOptions);
                activeEditorView = null;
                activeTriggerStart = null;
                component?.element?.remove();
                component?.destroy();
                component = null;
              },
            };
          },
        }),
        ...(triggerCleanupStorageKey
          ? [
              new Plugin({
                key: new PluginKey(cleanupPluginKeyName),
                view: () => ({
                  update: (view) => {
                    const triggerStart = extensionStorage[
                      triggerCleanupStorageKey
                    ] as number | null;

                    if (
                      triggerStart !== null &&
                      !hasSlashCharacterAtPosition(view.state, triggerStart)
                    ) {
                      (extensionStorage[triggerCleanupStorageKey] as
                        | number
                        | null) = null;
                    }
                  },
                }),
              }),
            ]
          : []),
      ];
    },
  });
}
