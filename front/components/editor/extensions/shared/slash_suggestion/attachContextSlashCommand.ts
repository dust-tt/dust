import type { ContextSlashSearchSelection } from "@app/components/editor/extensions/shared/slash_suggestion/contextSlashSearchTypes";
import { isContextSlashSearchSelection } from "@app/components/editor/extensions/shared/slash_suggestion/contextSlashSearchTypes";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";

export const SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION =
  "select-attach-context";

export interface AttachContextSlashCommand extends SlashCommand {
  action: typeof SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION;
  data: {
    selection: ContextSlashSearchSelection;
  };
}

export function isAttachContextSlashCommand(
  item: SlashCommand
): item is AttachContextSlashCommand {
  if (item.action !== SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION) {
    return false;
  }

  if (
    !item.data ||
    typeof item.data !== "object" ||
    !("selection" in item.data)
  ) {
    return false;
  }

  return isContextSlashSearchSelection(item.data.selection);
}
