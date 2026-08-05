import { INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import type { PickModelSlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/pickModelSlashCommand";
import { PICK_MODEL_SLASH_COMMAND_ACTION } from "@app/components/editor/extensions/shared/slash_suggestion/pickModelSlashCommand";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { getSlashCommandAvatarIcon } from "@app/components/editor/extensions/shared/slash_suggestion/slashCommandIcons";
import { Attachment01, Brain } from "@dust-tt/sparkle";

export function createAttachKnowledgeSlashCommand(): SlashCommand {
  return {
    action: INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION,
    description: "Search knowledge and reference conversation or pod files",
    icon: getSlashCommandAvatarIcon(Attachment01),
    id: "attach-knowledge",
    label: "Attach knowledge",
    tooltip: {
      description: "Use company knowledge or reference files for context.",
      media: (
        <img
          alt="Knowledge Search Interface"
          className="aspect-[4/3] w-full rounded object-cover"
          src="/static/landing/product/Knowledge_Tooltips.jpg"
        />
      ),
    },
  };
}

export function createPickModelSlashCommand(): PickModelSlashCommand {
  return {
    action: PICK_MODEL_SLASH_COMMAND_ACTION,
    description: "Override the model used",
    icon: getSlashCommandAvatarIcon(Brain),
    id: "pick-model",
    label: "Pick model",
  };
}
