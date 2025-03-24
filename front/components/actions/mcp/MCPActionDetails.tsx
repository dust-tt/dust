import { ServerIcon } from "@dust-tt/sparkle";
import { Markdown } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";

export function MCPActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  //TODO(mcp): have a much better display of the MCP action.
  return (
    <ActionDetailsWrapper
      actionName={action.functionCallName ?? "Calling MCP Server"}
      defaultOpen={defaultOpen}
      visual={ServerIcon}
    >
      <div className="flex flex-col gap-1 gap-4 py-4 pl-6">
        <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
          <Markdown
            content={`\`\`\`json\n${JSON.stringify(action.params).replace("\n", "aa") ?? ""}`}
            textColor="text-muted-foreground"
            isStreaming={false}
            forcedTextSize="md"
            isLastMessage={false}
          />
        </div>

        {action.output && (
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            <Markdown
              content={`\`\`\`json\n${action.output
                // @ts-expect-error TODO(mcp): fixing typing resulting to unknown type
                .filter((o) => o.text || o.resource.text)
                // @ts-expect-error TODO(mcp): fixing typing resulting to unknown type
                .map((o) => o.text || o.resource.text)
                .join("\n")}`}
              textColor="text-muted-foreground"
              isStreaming={false}
              forcedTextSize="md"
              isLastMessage={false}
            />
          </div>
        )}
      </div>
    </ActionDetailsWrapper>
  );
}
