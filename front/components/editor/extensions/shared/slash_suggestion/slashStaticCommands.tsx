import type { PickModelSlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/pickModelSlashCommand";
import { PICK_MODEL_SLASH_COMMAND_ACTION } from "@app/components/editor/extensions/shared/slash_suggestion/pickModelSlashCommand";
import type { SelectSpacesSlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/selectSpacesSlashCommand";
import { SELECT_SPACES_SLASH_COMMAND_ACTION } from "@app/components/editor/extensions/shared/slash_suggestion/selectSpacesSlashCommand";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { getSlashCommandAvatarIcon } from "@app/components/editor/extensions/shared/slash_suggestion/slashCommandIcons";
import { INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import { BookOpen01, Brain, Planet } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

type Translate = (descriptor: MessageDescriptor) => string;

export function createAttachKnowledgeSlashCommand(t: Translate): SlashCommand {
  return {
    action: INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION,
    description: t(
      msg`Search knowledge and reference conversation or Pod files`
    ),
    icon: getSlashCommandAvatarIcon(BookOpen01),
    id: "attach-knowledge",
    label: t(msg`Attach`),
    tooltip: {
      description: t(
        msg`Use company knowledge or reference files for context.`
      ),
      media: (
        <img
          alt={t(msg`Knowledge search interface`)}
          className="aspect-[4/3] w-full rounded object-cover"
          src="/static/landing/product/Knowledge_Tooltips.jpg"
        />
      ),
    },
  };
}

export function createPickModelSlashCommand(
  t: Translate
): PickModelSlashCommand {
  return {
    action: PICK_MODEL_SLASH_COMMAND_ACTION,
    description: t(msg`Override the model used`),
    icon: getSlashCommandAvatarIcon(Brain),
    id: "pick-model",
    label: t(msg`Pick model`),
  };
}

export function createSelectSpacesSlashCommand(
  t: Translate
): SelectSpacesSlashCommand {
  return {
    action: SELECT_SPACES_SLASH_COMMAND_ACTION,
    description: t(msg`Give the agent access to additional spaces`),
    icon: getSlashCommandAvatarIcon(Planet),
    id: "select-spaces",
    label: t(msg`Spaces`),
  };
}
