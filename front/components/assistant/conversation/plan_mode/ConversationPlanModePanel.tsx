import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { extractPlanTitle } from "@app/components/assistant/conversation/plan_mode/utils";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { usePlanFile } from "@app/hooks/conversations/usePlanFile";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Markdown, Spinner, XClose } from "@dust-tt/sparkle";

interface ConversationPlanModePanelProps {
  conversation: ConversationWithoutContentType;
  owner: LightWorkspaceType;
}

export function ConversationPlanModePanel({
  conversation,
  owner,
}: ConversationPlanModePanelProps) {
  const { closePanel } = useConversationSidePanelContext();
  const { content, isPlanLoading } = usePlanFile({
    conversationId: conversation.sId,
    workspaceId: owner.sId,
  });

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
          <Button
            variant="ghost"
            size="sm"
            onClick={closePanel}
            icon={XClose}
          />
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
