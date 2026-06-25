import { isInsertKnowledgeSlashCommand } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import type { Editor, Range } from "@tiptap/core";

export const ATTACH_CONTEXT_SUB_MENU_ID = "attach-context";

export type SlashSubMenuId = typeof ATTACH_CONTEXT_SUB_MENU_ID;

export interface SlashMenuStackFrame {
  command: SlashCommand;
  subMenuId: SlashSubMenuId;
}

export interface SlashMenuNavigationStorage {
  menuStack: SlashMenuStackFrame[];
}

export interface SlashCommandEditorStorage extends SlashMenuNavigationStorage {
  hasBeenFocused: boolean;
}

export interface InputBarSlashSuggestionEditorStorage
  extends SlashMenuNavigationStorage {
  dismissedTriggerStart: number | null;
  hasBeenFocused: boolean;
}

declare module "@tiptap/core" {
  interface Storage {
    inputBarSlashSuggestion: InputBarSlashSuggestionEditorStorage;
    slashCommand: SlashCommandEditorStorage;
  }
}

export function createSlashMenuNavigationStorage(): SlashMenuNavigationStorage {
  return {
    menuStack: [],
  };
}

export function getSlashCommandSubMenuId(
  item: SlashCommand
): SlashSubMenuId | null {
  if (isInsertKnowledgeSlashCommand(item)) {
    return ATTACH_CONTEXT_SUB_MENU_ID;
  }

  return null;
}

export function getActiveSlashSubMenuFrame(
  storage: SlashMenuNavigationStorage
): SlashMenuStackFrame | null {
  return storage.menuStack[storage.menuStack.length - 1] ?? null;
}

export function enterSlashSubMenu({
  command,
  editor,
  range,
  storage,
  subMenuId,
}: {
  command: SlashCommand;
  editor: Editor;
  range: Range;
  storage: SlashMenuNavigationStorage;
  subMenuId: SlashSubMenuId;
}) {
  storage.menuStack = [...storage.menuStack, { command, subMenuId }];

  const chain = editor.chain().focus();
  if (range.to > range.from + 1) {
    chain.deleteRange({ from: range.from + 1, to: range.to });
  }
  chain.run();

  // Entering a sub-menu mutates extension storage only. Force a transaction so
  // dropdown hooks subscribed to editor updates re-render (e.g. click with empty query).
  editor.view.dispatch(editor.state.tr.setMeta("slashMenuNavigation", true));
}

export function popSlashSubMenu({
  editor,
  range,
  storage,
}: {
  editor: Editor;
  range: Range;
  storage: SlashMenuNavigationStorage;
}) {
  storage.menuStack = storage.menuStack.slice(0, -1);

  const chain = editor.chain().focus();
  if (range.to > range.from + 1) {
    chain.deleteRange({ from: range.from + 1, to: range.to });
  }
  chain.run();

  editor.view.dispatch(editor.state.tr.setMeta("slashMenuNavigation", true));
}

export function clearSlashSubMenuStack(storage: SlashMenuNavigationStorage) {
  storage.menuStack = [];
}

export function handleSlashSubMenuCommand({
  command,
  editor,
  range,
  storage,
}: {
  command: SlashCommand;
  editor: Editor;
  range: Range;
  storage: SlashMenuNavigationStorage;
}): boolean {
  const subMenuId = getSlashCommandSubMenuId(command);
  if (!subMenuId) {
    return false;
  }

  enterSlashSubMenu({
    command,
    editor,
    range,
    storage,
    subMenuId,
  });
  return true;
}
