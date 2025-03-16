import { ChatBubbleThoughtIcon, ContentMessage } from "@dust-tt/sparkle";
import { Markdown } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { ReasoningActionType } from "@app/lib/actions/reasoning";

export function ReasoningActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<ReasoningActionType>) {
  return (
    <ActionDetailsWrapper
      actionName="Reasoning"
      defaultOpen={defaultOpen}
      visual={ChatBubbleThoughtIcon}
    >
      <div className="flex flex-col gap-1 gap-4 py-4 pl-6">
        {action.thinking && <ReasoningThinking action={action} />}
        {action.output && (
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            <Markdown
              content={action.output}
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

function ReasoningThinking({ action }: { action: ReasoningActionType }) {
  const { thinking } = action;
  if (!thinking) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
        <ContentMessage variant="slate" size="lg">
          <Markdown
            content={thinking}
            forcedTextSize="md"
            textColor="text-muted-foreground"
            isLastMessage={false}
          />
        </ContentMessage>
      </div>
    </div>
  );
}
