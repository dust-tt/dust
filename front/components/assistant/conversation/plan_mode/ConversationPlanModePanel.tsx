import { extractPlanTitle } from "@app/components/assistant/conversation/plan_mode/utils";
import { SidePanelCloseButton } from "@app/components/assistant/conversation/SidePanelCloseButton";
import { ConfirmContext } from "@app/components/Confirm";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import {
  useClosePlan,
  usePlanFile,
} from "@app/hooks/conversations/usePlanFile";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { Archive, Button, Markdown, Spinner } from "@dust-tt/sparkle";
import { useContext } from "react";

interface ConversationPlanModePanelProps {
  conversation: ConversationWithoutContentType;
  owner: LightWorkspaceType;
}

export function ConversationPlanModePanel({
  conversation,
  owner,
}: ConversationPlanModePanelProps) {
  const { content, isPlanLoading } = usePlanFile({
    conversationId: conversation.sId,
    workspaceId: owner.sId,
  });
  const { closePlan, isClosing } = useClosePlan({
    workspaceId: owner.sId,
    conversationId: conversation.sId,
  });
  const confirm = useContext(ConfirmContext);

  // Sits next to the panel close button, so ask before archiving.
  const archivePlan = async () => {
    const confirmed = await confirm({
      title: "Archive this plan?",
      message:
        "This will hide the current plan from the side panel, but keep it in the conversation's files. The agent can create a new one.",
      validateLabel: "Archive plan",
      validateVariant: "primary",
    });
    if (confirmed) {
      await closePlan();
    }
  };

  const title = extractPlanTitle(content);

  return (
    <div className="flex h-panel flex-col">
      <AppLayoutTitle>
        <div className="flex h-full items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              Plan: {title}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {content && (
              <Button
                variant="ghost"
                size="sm"
                icon={Archive}
                tooltip="Archive plan"
                isLoading={isClosing}
                onClick={() => void archivePlan()}
              />
            )}
            <SidePanelCloseButton />
          </div>
        </div>
      </AppLayoutTitle>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {isPlanLoading && !content ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : !content ? (
          <div className="text-sm text-muted-foreground">
            No active plan for this conversation.
          </div>
        ) : (
          // Plain (non-memoized) blocks so each edit re-renders items in place and the step
          // badges can transition when the agent ticks a task. Items are matched by position,
          // so inserting a task above completed ones replays their check animation once.
          <Markdown
            content={content}
            taskListVariant="step"
            optimizeForStreaming={false}
          />
        )}
      </div>
    </div>
  );
}
