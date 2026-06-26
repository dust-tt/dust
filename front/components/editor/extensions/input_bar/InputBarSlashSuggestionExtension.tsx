import { InputBarSlashSuggestionDropdown } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionDropdown";
import type { InputBarSlashCommand } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionTypes";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { createSlashSuggestionExtension } from "@app/components/editor/extensions/shared/slash_suggestion/SlashSuggestionExtension";
import {
  clearSlashSubMenuStack,
  createSlashMenuNavigationStorage,
  handleSlashSubMenuCommand,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import { isAllowedSlashQuery } from "@app/components/editor/extensions/shared/slash_suggestion/slashSuggestionUtils";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import type { WorkspaceType } from "@app/types/user";
import { PluginKey } from "@tiptap/pm/state";
import type { RefObject } from "react";

export const inputBarSlashSuggestionPluginKey = new PluginKey(
  "inputBarSlashSuggestion"
);

interface InputBarSlashSuggestionStorage {
  dismissedTriggerStart: number | null;
  hasBeenFocused: boolean;
  menuStack: ReturnType<typeof createSlashMenuNavigationStorage>["menuStack"];
}

export interface InputBarSlashSuggestionExtensionOptions {
  attachedNodesRef: RefObject<DataSourceViewContentNode[]>;
  conversationIdRef?: RefObject<string | null>;
  enabledRef: RefObject<boolean>;
  includeAttachKnowledgeRef: RefObject<boolean>;
  onActiveChangeRef?: RefObject<((active: boolean) => void) | undefined>;
  onDetailsRef?: RefObject<((item: SlashCommand) => void) | undefined>;
  onNodeSelectRef: RefObject<
    ((node: DataSourceViewContentNode) => void) | undefined
  >;
  onSelectRef: RefObject<((item: SlashCommand) => void) | undefined>;
  owner?: WorkspaceType;
  selectedMCPServerViewIdsRef: RefObject<Set<string>>;
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
    attachedNodesRef: { current: [] },
    owner: undefined,
    conversationIdRef: { current: null },
    enabledRef: { current: false },
    includeAttachKnowledgeRef: { current: false },
    onNodeSelectRef: { current: undefined },
    onSelectRef: { current: undefined },
    onDetailsRef: { current: undefined },
    selectedMCPServerViewIdsRef: { current: new Set<string>() },
    slashCommandsRef: { current: [] },
    spaceIdRef: { current: null },
  },
  allow: ({ editor, state, range, isActive, options, storage }) =>
    Boolean(options.owner) &&
    Boolean(options.enabledRef.current) &&
    storage.hasBeenFocused &&
    (editor.isFocused || isActive) &&
    storage.dismissedTriggerStart !== range.from &&
    isAllowedSlashQuery(state, range),
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
    attachedNodesRef: options.attachedNodesRef,
    conversationIdRef: options.conversationIdRef,
    onDetailsRef: options.onDetailsRef,
    onNodeSelectRef: options.onNodeSelectRef,
    owner: options.owner,
    selectedMCPServerViewIdsRef: options.selectedMCPServerViewIdsRef,
    slashCommandsRef: options.slashCommandsRef,
    includeAttachKnowledgeRef: options.includeAttachKnowledgeRef,
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
  preventEscapeDefault: true,
});
