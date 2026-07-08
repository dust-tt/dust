import { RUN_COMMAND_SLASH_COMMAND_ACTION } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { getSlashCommandAvatarIcon } from "@app/components/editor/extensions/shared/slash_suggestion/slashCommandIcons";
import { createAttachKnowledgeSlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/slashStaticCommands";
import type {
  InputBarSlashCommand,
  InputBarSlashCommandId,
} from "./InputBarSlashSuggestionTypes";
import { INPUT_BAR_SLASH_COMMAND_ORDER } from "./InputBarSlashSuggestionTypes";

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

function matchesInputBarSlashCommandItem(
  item: SlashCommand,
  normalizedQuery: string
): boolean {
  if (normalizedQuery.length === 0) {
    return true;
  }

  return [item.label, item.description, item.tooltip?.description]
    .filter((value): value is string => value !== undefined)
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function getInputBarSlashCommandById({
  commandId,
  commands,
  includeAttachKnowledge,
}: {
  commandId: InputBarSlashCommandId;
  commands: InputBarSlashCommand[];
  includeAttachKnowledge: boolean;
}): SlashCommand | null {
  const runCommand = commands.find((command) => command.id === commandId);
  if (runCommand) {
    return getInputBarRunCommandSlashCommandItem(runCommand);
  }

  if (commandId === "attach-knowledge") {
    return includeAttachKnowledge ? ATTACH_KNOWLEDGE_SLASH_COMMAND : null;
  }

  return null;
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

  return INPUT_BAR_SLASH_COMMAND_ORDER.flatMap((commandId) => {
    const item = getInputBarSlashCommandById({
      commandId,
      commands,
      includeAttachKnowledge,
    });

    if (!item || !matchesInputBarSlashCommandItem(item, normalizedQuery)) {
      return [];
    }

    return [item];
  });
}
