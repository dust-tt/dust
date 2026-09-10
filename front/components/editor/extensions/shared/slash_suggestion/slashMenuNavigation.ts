import { isInsertKnowledgeSlashCommand } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import { isPickModelSlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/pickModelSlashCommand";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import type { Editor, Range } from "@tiptap/core";

export const ATTACH_CONTEXT_SUB_MENU_ID = "attach-context";
export const PICK_MODEL_SUB_MENU_ID = "pick-model";

export type SlashSubMenuId =
  | typeof ATTACH_CONTEXT_SUB_MENU_ID
  | typeof PICK_MODEL_SUB_MENU_ID;

export interface SlashMenuStackFrame {
  command: SlashCommand;
  subMenuId: SlashSubMenuId;
}

interface SlashMenuNavigationStorage {
  menuStack: SlashMenuStackFrame[];
}

interface SlashCommandEditorStorage extends SlashMenuNavigationStorage {
  hasBeenFocused: boolean;
}

interface InputBarSlashSuggestionEditorStorage
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

function getSlashCommandSubMenuId(item: SlashCommand): SlashSubMenuId | null {
  if (isInsertKnowledgeSlashCommand(item)) {
    return ATTACH_CONTEXT_SUB_MENU_ID;
  }

  if (isPickModelSlashCommand(item)) {
    return PICK_MODEL_SUB_MENU_ID;
  }

  return null;
}

export interface ResolvedSlashSubMenu {
  frame: SlashMenuStackFrame;
  // True when the frame is derived from the query text rather than the menu stack.
  fromQuery: boolean;
  query: string;
}

/**
 * @cc [owner:PopDaph,label:product] space-enters-first-sub-menu-command
 * A query containing a space resolves to the sub-menu of the first item of `commandItems` whose
 * label has a word (split on whitespace and hyphens) starting, case-insensitively, with the text
 * before the first space, with the remainder as the sub-menu query. It resolves to `null` when
 * that text is empty, no label matches, or the first match is not a sub-menu command.
 */
export function resolveSlashSubMenuFromQuery({
  commandItems,
  query,
}: {
  commandItems: SlashCommand[];
  query: string;
}): ResolvedSlashSubMenu | null {
  const spaceIndex = query.indexOf(" ");
  if (spaceIndex <= 0) {
    return null;
  }

  const head = query.slice(0, spaceIndex).toLowerCase();
  const command = commandItems.find((item) =>
    item.label
      .toLowerCase()
      .split(/[\s-]+/)
      .some((word) => word.startsWith(head))
  );
  const subMenuId = command ? getSlashCommandSubMenuId(command) : null;
  if (!command || !subMenuId) {
    return null;
  }

  return {
    frame: { command, subMenuId },
    fromQuery: true,
    query: query.slice(spaceIndex + 1),
  };
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
