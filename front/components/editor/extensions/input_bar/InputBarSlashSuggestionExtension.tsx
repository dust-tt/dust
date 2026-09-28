import { InputBarSlashSuggestionDropdown } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionDropdown";
import type { InputBarSlashCommand } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionTypes";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { createSlashSuggestionExtension } from "@app/components/editor/extensions/shared/slash_suggestion/SlashSuggestionExtension";
import {
  clearSlashSubMenuStack,
  createSlashMenuNavigationStorage,
  getActiveSlashSubMenuFrame,
  getSlashSubMenuQueryPlaceholder,
  handleSlashSubMenuCommand,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import {
  getSlashTriggerText,
  isAllowedSlashQuery,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashSuggestionUtils";
import type { Selection } from "@app/components/model_picker/modelPickerUtils";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import type { WorkspaceType } from "@app/types/user";
import type { ChainedCommands } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import type { RefObject } from "react";

export const inputBarSlashSuggestionPluginKey = new PluginKey(
  "inputBarSlashSuggestion"
);

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    inputBarSlashSuggestion: {
      openInputBarSlashCommand: () => ReturnType;
    };
  }
}

interface InputBarSlashSuggestionStorage {
  dismissedTriggerStart: number | null;
  hasBeenFocused: boolean;
  menuStack: ReturnType<typeof createSlashMenuNavigationStorage>["menuStack"];
}

interface InputBarSlashSuggestionExtensionOptions {
  conversationIdRef?: RefObject<string | null>;
  enabledRef: RefObject<boolean>;
  includeAttachKnowledgeRef: RefObject<boolean>;
  includePickModelRef: RefObject<boolean>;
  includeSelectSpacesRef: RefObject<boolean>;
  onActiveChangeRef?: RefObject<((active: boolean) => void) | undefined>;
  onDetailsRef?: RefObject<((item: SlashCommand) => void) | undefined>;
  onModelSelectRef: RefObject<((selection: Selection) => void) | undefined>;
  onNodeSelectRef: RefObject<
    ((node: DataSourceViewContentNode) => void) | undefined
  >;
  onSelectRef: RefObject<((item: SlashCommand) => void) | undefined>;
  owner?: WorkspaceType;
  slashCommandsRef: RefObject<InputBarSlashCommand[]>;
  spaceIdRef: RefObject<string | null | undefined>;
}

export const InputBarSlashSuggestionExtension = createSlashSuggestionExtension<
  InputBarSlashSuggestionExtensionOptions,
  InputBarSlashSuggestionStorage,
  SlashCommand
>({
  name: "inputBarSlashSuggestion",
  pluginKey: inputBarSlashSuggestionPluginKey,
  cleanupPluginKeyName: "inputBarSlashSuggestionCleanup",
  triggerCleanupStorageKey: "dismissedTriggerStart",
  DropdownComponent: InputBarSlashSuggestionDropdown,
  createStorage: () => ({
    hasBeenFocused: false,
    dismissedTriggerStart: null,
    ...createSlashMenuNavigationStorage(),
  }),
  defaultOptions: {
    owner: undefined,
    conversationIdRef: { current: null },
    enabledRef: { current: false },
    includeAttachKnowledgeRef: { current: false },
    includePickModelRef: { current: false },
    includeSelectSpacesRef: { current: false },
    onModelSelectRef: { current: undefined },
    onNodeSelectRef: { current: undefined },
    onSelectRef: { current: undefined },
    onDetailsRef: { current: undefined },
    slashCommandsRef: { current: [] },
    spaceIdRef: { current: null },
  },
  allow: ({ editor, state, range, isActive, options, storage }) =>
    Boolean(options.owner) &&
    Boolean(options.enabledRef.current) &&
    storage.hasBeenFocused &&
    (editor.isFocused || isActive) &&
    storage.dismissedTriggerStart !== range.from &&
    // Inside a sub-menu the text after "/" is its query, so a leading space is allowed.
    (getActiveSlashSubMenuFrame(storage) !== null ||
      isAllowedSlashQuery(state, range)),
  // Inserts a "/" at the cursor to open the dropdown, even if the editor was
  // never focused or the dropdown was dismissed at this position.
  addCommands: ({ storage, editor }) => ({
    openInputBarSlashCommand:
      () =>
      ({ chain }: { chain: () => ChainedCommands }) => {
        storage.hasBeenFocused = true;
        storage.dismissedTriggerStart = null;
        return chain()
          .focus()
          .insertContent(getSlashTriggerText(editor.state))
          .run();
      },
  }),
  shouldShow: ({ transaction }) =>
    !transaction.getMeta("paste") && transaction.getMeta("uiEvent") !== "paste",
  items: () => [],
  command: ({ editor, range, props, options, storage }) => {
    storage.dismissedTriggerStart = null;

    if (
      handleSlashSubMenuCommand({
        command: props,
        editor,
        range,
        storage,
      })
    ) {
      return;
    }

    editor.chain().focus().deleteRange(range).run();
    options.onSelectRef.current?.(props);
  },
  shouldMountDropdown: ({ props, options }) =>
    Boolean(options.owner) && Boolean(props.clientRect),
  mapDropdownProps: ({ options }) => ({
    conversationIdRef: options.conversationIdRef,
    includeAttachKnowledgeRef: options.includeAttachKnowledgeRef,
    includePickModelRef: options.includePickModelRef,
    includeSelectSpacesRef: options.includeSelectSpacesRef,
    onDetailsRef: options.onDetailsRef,
    onModelSelectRef: options.onModelSelectRef,
    onNodeSelectRef: options.onNodeSelectRef,
    owner: options.owner,
    slashCommandsRef: options.slashCommandsRef,
    spaceIdRef: options.spaceIdRef,
  }),
  notifyActiveChange: (active, options) => {
    options.onActiveChangeRef?.current?.(active);
  },
  onDropdownClose: ({ storage, triggerStart }) => {
    clearSlashSubMenuStack(storage);
    if (triggerStart !== null) {
      storage.dismissedTriggerStart = triggerStart;
    }
  },
  // A new "/" always starts at the root, however the previous session ended.
  onDropdownExit: ({ storage }) => {
    clearSlashSubMenuStack(storage);
  },
  getQueryPlaceholder: ({ storage }) =>
    getSlashSubMenuQueryPlaceholder(storage),
  preventEscapeDefault: true,
});
