import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import {
  contentHash,
  extractPlanTitle,
} from "@app/components/assistant/conversation/plan_mode/utils";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { usePlanFile } from "@app/hooks/conversations/usePlanFile";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Markdown, Spinner, XClose } from "@dust-tt/sparkle";
import { useMemo } from "react";

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
  const markdownKey = useMemo(
    () => (content ? contentHash(content) : ""),
    [content]
  );

  return (
    <div className="flex h-full flex-col">
      <AppLayoutTitle>
        <div className="flex h-full items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground dark:text-foreground-night">
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
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isPlanLoading && !content ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : !content ? (
          <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            No active plan for this conversation.
          </div>
        ) : (
          // Remount on each edit: Sparkle's `Markdown` memoizes AST nodes for streaming reveal and
          // can keep stale children when the whole content prop is replaced between edits.
          <Markdown key={markdownKey} content={content} />
        )}
      </div>
    </div>
  );
}
