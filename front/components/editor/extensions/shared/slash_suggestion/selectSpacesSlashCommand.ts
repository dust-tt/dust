import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";

export const SELECT_SPACES_SLASH_COMMAND_ACTION = "select-spaces";

export interface SelectSpacesSlashCommand extends SlashCommand {
  action: typeof SELECT_SPACES_SLASH_COMMAND_ACTION;
}

export function isSelectSpacesSlashCommand(
  item: SlashCommand
): item is SelectSpacesSlashCommand {
  return item.action === SELECT_SPACES_SLASH_COMMAND_ACTION;
}
