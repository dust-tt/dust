import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { getSlashCommandAvatarIcon } from "@app/components/editor/extensions/shared/slash_suggestion/slashCommandIcons";
import {
  createAttachKnowledgeSlashCommand,
  createPickModelSlashCommand,
  createSelectSpacesSlashCommand,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashStaticCommands";
import { RUN_COMMAND_SLASH_COMMAND_ACTION } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import type { MessageDescriptor } from "@lingui/core";
import type {
  InputBarSlashCommand,
  InputBarSlashCommandId,
} from "./InputBarSlashSuggestionTypes";
import { INPUT_BAR_SLASH_COMMAND_ORDER } from "./InputBarSlashSuggestionTypes";

type Translate = (descriptor: MessageDescriptor) => string;

function getInputBarRunCommandSlashCommandItem(
  command: InputBarSlashCommand,
  t: Translate
): SlashCommand {
  return {
    action: RUN_COMMAND_SLASH_COMMAND_ACTION,
    data: { command },
    description: t(command.description),
    icon: getSlashCommandAvatarIcon(command.icon),
    id: `command-${command.id}`,
    label: t(command.label),
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
  includePickModel,
  includeSelectSpaces,
  t,
}: {
  commandId: InputBarSlashCommandId;
  commands: InputBarSlashCommand[];
  includeAttachKnowledge: boolean;
  includePickModel: boolean;
  includeSelectSpaces: boolean;
  t: Translate;
}): SlashCommand | null {
  const runCommand = commands.find((command) => command.id === commandId);
  if (runCommand) {
    return getInputBarRunCommandSlashCommandItem(runCommand, t);
  }

  if (commandId === "attach-knowledge") {
    return includeAttachKnowledge ? createAttachKnowledgeSlashCommand(t) : null;
  }

  if (commandId === "pick-model") {
    return includePickModel ? createPickModelSlashCommand(t) : null;
  }

  if (commandId === "select-spaces") {
    return includeSelectSpaces ? createSelectSpacesSlashCommand(t) : null;
  }

  return null;
}

export function getInputBarSlashCommandItems({
  commands,
  includeAttachKnowledge,
  includePickModel,
  includeSelectSpaces,
  t,
}: {
  commands: InputBarSlashCommand[];
  includeAttachKnowledge: boolean;
  includePickModel: boolean;
  includeSelectSpaces: boolean;
  t: Translate;
}): SlashCommand[] {
  return INPUT_BAR_SLASH_COMMAND_ORDER.flatMap((commandId) => {
    const item = getInputBarSlashCommandById({
      commandId,
      commands,
      includeAttachKnowledge,
      includePickModel,
      includeSelectSpaces,
      t,
    });

    return item ? [item] : [];
  });
}

export function filterInputBarSlashCommandItems(
  items: SlashCommand[],
  query: string
): SlashCommand[] {
  const normalizedQuery = query.trim().toLowerCase();

  return items.filter((item) =>
    matchesInputBarSlashCommandItem(item, normalizedQuery)
  );
}
