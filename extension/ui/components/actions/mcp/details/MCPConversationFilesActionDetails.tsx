import { ActionDetailsWrapper } from "@app/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/ui/components/actions/mcp/details/MCPActionDetails";
import { DocumentIcon } from "@dust-tt/sparkle";

export function MCPConversationCatFileDetails({
  viewType,
}: MCPActionDetailsProps) {
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={
        viewType === "conversation"
          ? "Reading conversation file"
          : "Read conversation file"
      }
      visual={DocumentIcon}
    >
      <></>
    </ActionDetailsWrapper>
  );
}
