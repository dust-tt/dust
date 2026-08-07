import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import type { Selection } from "@app/components/model_picker/modelPickerUtils";

export const PICK_MODEL_SLASH_COMMAND_ACTION = "pick-model";
export const SELECT_MODEL_SLASH_COMMAND_ACTION = "select-model";

export interface PickModelSlashCommand extends SlashCommand {
  action: typeof PICK_MODEL_SLASH_COMMAND_ACTION;
}

export interface SelectModelSlashCommand extends SlashCommand {
  action: typeof SELECT_MODEL_SLASH_COMMAND_ACTION;
  data: {
    selection: Selection;
  };
}

export function isPickModelSlashCommand(
  item: SlashCommand
): item is PickModelSlashCommand {
  return item.action === PICK_MODEL_SLASH_COMMAND_ACTION;
}

export function isSelectModelSlashCommand(
  item: SlashCommand
): item is SelectModelSlashCommand {
  if (item.action !== SELECT_MODEL_SLASH_COMMAND_ACTION) {
    return false;
  }

  if (
    !item.data ||
    typeof item.data !== "object" ||
    !("selection" in item.data)
  ) {
    return false;
  }

  const { selection } = item.data;
  return (
    typeof selection === "object" &&
    selection !== null &&
    "display" in selection &&
    "toSend" in selection
  );
}
