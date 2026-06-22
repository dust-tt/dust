import { InputBarSlashSuggestionDropdown } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionDropdown";
import { isAddCapabilitySlashCommand } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { createSlashSuggestionExtension } from "@app/components/editor/extensions/shared/slash_suggestion/SlashSuggestionExtension";
import { isAllowedSlashQuery } from "@app/components/editor/extensions/shared/slash_suggestion/slashSuggestionUtils";
import type { WorkspaceType } from "@app/types/user";
import { PluginKey } from "@tiptap/pm/state";
import type { RefObject } from "react";

export const inputBarSlashSuggestionPluginKey = new PluginKey(
  "inputBarSlashSuggestion"
);

interface InputBarSlashSuggestionStorage {
  dismissedTriggerStart: number | null;
  hasBeenFocused: boolean;
}

export interface InputBarSlashSuggestionExtensionOptions {
  conversationIdRef?: RefObject<string | null>;
  enabledRef: RefObject<boolean>;
  onActiveChangeRef?: RefObject<((active: boolean) => void) | undefined>;
  onDetailsRef?: RefObject<((item: SlashCommand) => void) | undefined>;
  onSelectRef: RefObject<((item: SlashCommand) => void) | undefined>;
  owner?: WorkspaceType;
  selectedMCPServerViewIdsRef: RefObject<Set<string>>;
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
  }),
  defaultOptions: {
    owner: undefined,
    conversationIdRef: { current: null },
    enabledRef: { current: false },
    onSelectRef: { current: undefined },
    onDetailsRef: { current: undefined },
    selectedMCPServerViewIdsRef: { current: new Set<string>() },
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

    if (isAddCapabilitySlashCommand(props)) {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertCapabilitySearchNode()
        .run();
      return;
    }

    editor.chain().focus().deleteRange(range).run();
    options.onSelectRef.current?.(props);
  },
  shouldMountDropdown: ({ props, options }) =>
    Boolean(options.owner) && Boolean(props.clientRect),
  mapDropdownProps: ({ options }) => ({
    conversationIdRef: options.conversationIdRef,
    onDetailsRef: options.onDetailsRef,
    owner: options.owner,
  }),
  notifyActiveChange: (active, options) => {
    options.onActiveChangeRef?.current?.(active);
  },
  onDropdownClose: ({ storage, triggerStart }) => {
    if (triggerStart !== null) {
      storage.dismissedTriggerStart = triggerStart;
    }
  },
  preventEscapeDefault: true,
});
