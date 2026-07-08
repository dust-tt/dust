import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";

export const SLASH_COMMANDS_SECTION_LABEL = "Commands";
export const SLASH_COMMAND_CAPABILITIES_SECTION_LABEL = "Capabilities";

export interface SlashCommandSection {
  label: string;
  items: SlashCommand[];
}

export function buildSlashCommandSections({
  commandItems,
  capabilityItems,
}: {
  commandItems: SlashCommand[];
  capabilityItems: SlashCommand[];
}): SlashCommandSection[] {
  const sections: SlashCommandSection[] = [];

  if (commandItems.length > 0) {
    sections.push({
      label: SLASH_COMMANDS_SECTION_LABEL,
      items: commandItems,
    });
  }

  if (capabilityItems.length > 0) {
    sections.push({
      label: SLASH_COMMAND_CAPABILITIES_SECTION_LABEL,
      items: capabilityItems,
    });
  }

  return sections;
}

export function flattenSlashCommandSections(
  sections: SlashCommandSection[]
): SlashCommand[] {
  return sections.flatMap((section) => section.items);
}
