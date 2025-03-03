import { ServerIcon } from "@dust-tt/sparkle";
import { Markdown } from "@dust-tt/sparkle";
import type { MCPActionType } from "@dust-tt/types";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";

export function MCPActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  return (
    <ActionDetailsWrapper
      actionName="Calling a tool"
      defaultOpen={defaultOpen}
      visual={ServerIcon}
    >
      <div className="flex flex-col gap-1 gap-4 py-4 pl-6">
        {action.output && (
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            <Markdown
              content={`\`\`\`json\n${action.output.replaceAll("\\n", "\n")}`}
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
