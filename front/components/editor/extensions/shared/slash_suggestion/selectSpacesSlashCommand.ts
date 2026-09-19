import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import type { SelectableConversationSpaceType } from "@app/types/assistant/conversation";

export const SELECT_SPACES_SLASH_COMMAND_ACTION = "select-spaces";
export const SELECT_SPACE_SLASH_COMMAND_ACTION = "select-space";

export interface SelectSpacesSlashCommand extends SlashCommand {
  action: typeof SELECT_SPACES_SLASH_COMMAND_ACTION;
}

export interface SelectSpaceSlashCommand extends SlashCommand {
  action: typeof SELECT_SPACE_SLASH_COMMAND_ACTION;
  data: {
    space: SelectableConversationSpaceType;
  };
}

export function isSelectSpacesSlashCommand(
  item: SlashCommand
): item is SelectSpacesSlashCommand {
  return item.action === SELECT_SPACES_SLASH_COMMAND_ACTION;
}

export function isSelectSpaceSlashCommand(
  item: SlashCommand
): item is SelectSpaceSlashCommand {
  if (item.action !== SELECT_SPACE_SLASH_COMMAND_ACTION) {
    return false;
  }

  if (!item.data || typeof item.data !== "object" || !("space" in item.data)) {
    return false;
  }

  const { space } = item.data;
  return (
    typeof space === "object" &&
    space !== null &&
    "sId" in space &&
    "name" in space
  );
}
