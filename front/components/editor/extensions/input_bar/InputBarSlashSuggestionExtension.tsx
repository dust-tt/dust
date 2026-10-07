import { InputBarSlashSuggestionDropdown } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionDropdown";
import type { InputBarSlashMenuRefs } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionTypes";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import {
  clearSlashSubMenuStack,
  createSlashMenuNavigationStorage,
  getActiveSlashSubMenuFrame,
  handleSlashSubMenuCommand,
  SLASH_MENU_QUERY_PLACEHOLDER,
  SLASH_MENU_QUERY_PLACEHOLDER_CLASS_NAME,
  SLASH_MENU_TRIGGER_CLASS_NAME,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import { createSlashSuggestionExtension } from "@app/components/editor/extensions/shared/slash_suggestion/SlashSuggestionExtension";
import { isAllowedSlashQuery } from "@app/components/editor/extensions/shared/slash_suggestion/slashSuggestionUtils";
import { i18n } from "@app/lib/i18n/i18n";
import type { WorkspaceType } from "@app/types/user";
import type { MessageDescriptor } from "@lingui/core";
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

type InputBarSlashSuggestionExtensionOptions = InputBarSlashMenuRefs & {
  enabledRef: RefObject<boolean>;
  onActiveChangeRef?: RefObject<((active: boolean) => void) | undefined>;
  owner?: WorkspaceType;
  t: (descriptor: MessageDescriptor) => string;
};

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
    slashMenuModeRef: { current: "commands" },
    spaceIdRef: { current: null },
    t: (descriptor) => i18n._(descriptor),
  },
  allow: ({ editor, state, range, isActive, options, storage }) =>
    Boolean(options.owner) &&
    Boolean(options.enabledRef.current) &&
    storage.hasBeenFocused &&
    (editor.isFocused || isActive) &&
    storage.dismissedTriggerStart !== range.from &&
    // Inside a sub-menu, or when the menu is only the browser, the text after "/" is a search
    // query, so a leading space is allowed.
    (getActiveSlashSubMenuFrame(storage) !== null ||
      options.slashMenuModeRef.current === "attach-only" ||
      isAllowedSlashQuery(state, range)),
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
    slashMenuModeRef: options.slashMenuModeRef,
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
  queryPlaceholder: (options) => options.t(SLASH_MENU_QUERY_PLACEHOLDER),
  queryPlaceholderClassName: SLASH_MENU_QUERY_PLACEHOLDER_CLASS_NAME,
  triggerClassName: SLASH_MENU_TRIGGER_CLASS_NAME,
  preventEscapeDefault: true,
});
