import {
  ChatBubbleThoughtIcon,
  ContentMessage,
  InformationCircleIcon,
} from "@dust-tt/sparkle";
import { Markdown } from "@dust-tt/sparkle";
import type { ReasoningActionType } from "@dust-tt/types";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";

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
      <div className="flex flex-col gap-1 gap-4 pl-6 pt-4">
        {/* TODO(REASONING TOOL): Add reasoning output, ensure streaming */}
        <ReasoningThinking action={action} />
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
      <span className="text-sm font-semibold text-foreground">Reasoning</span>
      <div className="text-sm font-normal text-muted-foreground">
        <ContentMessage
          title="Thoughts"
          variant="slate"
          icon={InformationCircleIcon}
          size="lg"
        >
          <Markdown
            content={thinking}
            isStreaming={false}
            forcedTextSize="text-sm"
            textColor="text-muted-foreground"
            isLastMessage={false}
          />
        </ContentMessage>
      </div>
    </div>
  );
}
