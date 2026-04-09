import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsDisplayContext } from "@app/components/actions/mcp/details/types";
import { InternalActionIcons } from "@app/components/resources/resources_icons";
import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import {
  getInternalMCPServerIconByName,
  isInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { getToolCallDisplayLabel } from "@app/lib/actions/tool_display_labels";
import { ToolsIcon } from "@dust-tt/sparkle";

function getPendingToolCallVisual(functionCallName: string) {
  const separatorIndex = functionCallName.lastIndexOf(TOOL_NAME_SEPARATOR);

  if (separatorIndex === -1) {
    return ToolsIcon;
  }

  const serverName = functionCallName.slice(0, separatorIndex);
  const candidates = [serverName];
  const nestedSeparatorIndex = serverName.lastIndexOf(TOOL_NAME_SEPARATOR);

  if (nestedSeparatorIndex !== -1) {
    candidates.push(
      serverName.slice(nestedSeparatorIndex + TOOL_NAME_SEPARATOR.length)
    );
  }

  for (const candidate of candidates) {
    if (isInternalMCPServerName(candidate)) {
      return InternalActionIcons[getInternalMCPServerIconByName(candidate)];
    }
  }

  return ToolsIcon;
}

interface PendingToolCallDetailsProps {
  displayContext: ActionDetailsDisplayContext;
  functionCallName: string;
  labelContext?: "running" | "done";
}

export function PendingToolCallDetails({
  displayContext,
  functionCallName,
  labelContext = "done",
}: PendingToolCallDetailsProps) {
  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={getToolCallDisplayLabel(functionCallName, labelContext)}
      visual={getPendingToolCallVisual(functionCallName)}
    />
  );
}
