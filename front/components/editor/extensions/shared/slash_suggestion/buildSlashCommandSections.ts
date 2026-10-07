import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

type Translate = (descriptor: MessageDescriptor) => string;

const SLASH_COMMANDS_SECTION_LABEL = msg`Commands`;
export const SLASH_COMMAND_CAPABILITIES_SECTION_LABEL = msg`Capabilities`;

export interface SlashCommandSection {
  label: string;
  items: SlashCommand[];
  // Shown under the label while `items` is empty: placeholder rows, else the message.
  isLoading?: boolean;
  emptyMessage?: string;
}

export function buildSlashCommandSections({
  commandItems,
  capabilityItems,
  t,
}: {
  commandItems: SlashCommand[];
  capabilityItems: SlashCommand[];
  t: Translate;
}): SlashCommandSection[] {
  const sections: SlashCommandSection[] = [];

  if (commandItems.length > 0) {
    sections.push({
      label: t(SLASH_COMMANDS_SECTION_LABEL),
      items: commandItems,
    });
  }

  if (capabilityItems.length > 0) {
    sections.push({
      label: t(SLASH_COMMAND_CAPABILITIES_SECTION_LABEL),
      items: capabilityItems,
    });
  }

  return sections;
}

// Whether some section renders on its own with no rows: placeholder rows while it loads, or its
// empty message once loaded.
export function someSectionShowsOwnState(
  sections: SlashCommandSection[]
): boolean {
  return sections.some(
    (section) =>
      section.items.length === 0 &&
      (section.isLoading === true || section.emptyMessage !== undefined)
  );
}

export function flattenSlashCommandSections(
  sections: SlashCommandSection[]
): SlashCommand[] {
  return sections.flatMap((section) => section.items);
}
