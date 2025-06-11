import { Markdown } from "@dust-tt/sparkle";
import { ChatBubbleThoughtIcon } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";
import { isDataSourceNodeContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";

export function DataSourceNodeContentDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  const dataSourceNodeContent = action.output
    ?.filter(isDataSourceNodeContentType)
    .map((o) => o.resource)?.[0];

  return (
    dataSourceNodeContent && (
      <ActionDetailsWrapper
        actionName="Show file content"
        defaultOpen={defaultOpen}
        visual={ChatBubbleThoughtIcon}
      >
        <Markdown
          content={dataSourceNodeContent.text}
          isStreaming={false}
          textColor="text-muted-foreground dark:text-muted-foreground-night"
        />
      </ActionDetailsWrapper>
    )
  );
}
