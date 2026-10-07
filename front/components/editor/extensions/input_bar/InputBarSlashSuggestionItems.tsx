import { withDefaultLocaleSearchText } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandItems";
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
    return withDefaultLocaleSearchText(
      (translate) =>
        getInputBarRunCommandSlashCommandItem(runCommand, translate),
      t
    );
  }

  if (commandId === "attach-knowledge") {
    return includeAttachKnowledge
      ? withDefaultLocaleSearchText(createAttachKnowledgeSlashCommand, t)
      : null;
  }

  if (commandId === "pick-model") {
    return includePickModel
      ? withDefaultLocaleSearchText(createPickModelSlashCommand, t)
      : null;
  }

  if (commandId === "select-spaces") {
    return includeSelectSpaces
      ? withDefaultLocaleSearchText(createSelectSpacesSlashCommand, t)
      : null;
  }

  return null;
}

/**
 * @cc [owner:sfriquet,label:product] match-translated-and-english
 * Every returned item MUST carry its `DEFAULT_LOCALE` label and descriptions in `searchText` (see
 * `withDefaultLocaleSearchText`), so that `filterSlashCommandItems` matches a query against both
 * the text translated by `t` and the English text, whatever the active locale.
 */
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
