import {
  ADD_CAPABILITY_SLASH_COMMAND_ACTION,
  INSERT_CONTEXT_FILE_SLASH_COMMAND_ACTION,
  INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { getSlashCommandAvatarIcon } from "@app/components/editor/extensions/shared/slash_suggestion/slashCommandIcons";
import { Attachment01, File02, ShapesPlus } from "@dust-tt/sparkle";

export function createAttachKnowledgeSlashCommand(): SlashCommand {
  return {
    action: INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION,
    description: "Search and attach company knowledge for context",
    icon: getSlashCommandAvatarIcon(Attachment01),
    id: "attach-knowledge",
    label: "Attach knowledge",
    tooltip: {
      description: "Use company knowledge for context.",
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

export function createSelectContextFileSlashCommand(): SlashCommand {
  return {
    action: INSERT_CONTEXT_FILE_SLASH_COMMAND_ACTION,
    description:
      "Reference a file from this conversation or pod in your message",
    icon: getSlashCommandAvatarIcon(File02),
    id: "reference-file",
    label: "Reference file",
  };
}

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
