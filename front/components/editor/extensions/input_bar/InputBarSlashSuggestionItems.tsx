import {
  matchesSlashCommandCapabilityQuery,
  RUN_COMMAND_SLASH_COMMAND_ACTION,
  sortSlashCommandCapabilityMatches,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import { filterSlashCommandItems } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandItems";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { getSlashCommandAvatarIcon } from "@app/components/editor/extensions/shared/slash_suggestion/slashCommandIcons";
import {
  createAddCapabilitySlashCommand,
  createAttachKnowledgeSlashCommand,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashStaticCommands";
import type { InputBarSlashCommand } from "./InputBarSlashSuggestionTypes";

const ADD_CAPABILITY_SLASH_COMMAND = createAddCapabilitySlashCommand(
  "Add a skill or tool to your message"
);
const ATTACH_KNOWLEDGE_SLASH_COMMAND = createAttachKnowledgeSlashCommand();

function getInputBarRunCommandSlashCommandItem(
  command: InputBarSlashCommand
): SlashCommand {
  return {
    action: RUN_COMMAND_SLASH_COMMAND_ACTION,
    data: { command },
    description: command.description,
    icon: getSlashCommandAvatarIcon(command.icon),
    id: `command-${command.id}`,
    label: command.label,
  };
}

export function buildInputBarSlashCommandItems({
  commands,
  includeAttachKnowledge,
  query,
}: {
  commands: InputBarSlashCommand[];
  includeAttachKnowledge: boolean;
  query: string;
}): SlashCommand[] {
  const normalizedQuery = query.trim().toLowerCase();

  const commandItems = sortSlashCommandCapabilityMatches({
    items: commands
      .filter((command) =>
        matchesSlashCommandCapabilityQuery({
          label: command.label,
          query: normalizedQuery,
        })
      )
      .map((command) => ({
        command,
        sortName: command.label.toLowerCase(),
      })),
    normalizedQuery,
  }).map(({ command }) => getInputBarRunCommandSlashCommandItem(command));

  return filterSlashCommandItems(
    [
      ...commandItems,
      ...(includeAttachKnowledge ? [ATTACH_KNOWLEDGE_SLASH_COMMAND] : []),
      ADD_CAPABILITY_SLASH_COMMAND,
    ],
    query
  );
}
