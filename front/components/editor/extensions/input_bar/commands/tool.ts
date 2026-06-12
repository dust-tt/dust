import type { InputBarSlashCommandDefinition } from "@app/components/editor/extensions/input_bar/commands/types";
import { getToolSlashCommandItem } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";

export const toolSlashCommandDefinition: InputBarSlashCommandDefinition<"tool"> =
  {
    kind: "tool",
    getItem: (capability) => ({
      ...getToolSlashCommandItem(capability.serverView),
      data: capability,
      id: `tool-${capability.serverView.sId}`,
    }),
    onSelect: (capability, { onMCPServerViewSelect }) => {
      onMCPServerViewSelect(capability.serverView);
    },
    onDetails: (capability, { openToolDetails }) => {
      openToolDetails(capability.serverView);
    },
  };
