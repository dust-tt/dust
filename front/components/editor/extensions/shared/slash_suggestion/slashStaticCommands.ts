import { ADD_CAPABILITY_SLASH_COMMAND_ACTION } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { getSlashCommandAvatarIcon } from "@app/components/editor/extensions/shared/slash_suggestion/slashCommandIcons";
import { ShapesPlus } from "@dust-tt/sparkle";

export function createAddCapabilitySlashCommand(
  description: string
): SlashCommand {
  return {
    action: ADD_CAPABILITY_SLASH_COMMAND_ACTION,
    description,
    icon: getSlashCommandAvatarIcon(ShapesPlus),
    id: "add-capability",
    label: "Add capability",
  };
}
