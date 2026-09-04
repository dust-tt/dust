import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { PlanPresence } from "@app/components/assistant/conversation/plan_mode/utils";
import {
  countProgress,
  extractPlanTitle,
  planPanelDecision,
} from "@app/components/assistant/conversation/plan_mode/utils";
import {
  useClosePlan,
  usePlanFile,
} from "@app/hooks/conversations/usePlanFile";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import {
  ContentMessageAction,
  ContentMessageInline,
  ListSelect,
  Trash04,
} from "@dust-tt/sparkle";
import React, { useEffect, useMemo, useRef } from "react";

interface PlanCardProps {
  conversationId: string | null;
  workspaceId: string;
}

export const PlanCard = React.memo(function PlanCard({
  conversationId,
  workspaceId,
}: PlanCardProps) {
  const { hasFeature } = useFeatureFlags();
  const isPlanModeEnabled = hasFeature("plan_mode");
  const { content, isPlanLoading } = usePlanFile({
    // Skip the fetch entirely for workspaces without the plan_mode feature flag.
    conversationId: isPlanModeEnabled ? conversationId : null,
    workspaceId,
  });
  const { currentPanel, openPanel, togglePanel, closePanel } =
    useConversationSidePanelContext();
  const isMobile = useIsMobile();
  const { closePlan, isClosing } = useClosePlan({
    workspaceId,
    conversationId,
  });

  // Single owner of the plan panel: open when the plan appears, close when it goes away. Driving
  // this off `content` (not a specific event) keeps it correct however the change arrived (live
  // action event, cross-client `plan_updated`, reconnect refetch). Must stay above the early return
  // so the close transition is observed when the card unmounts its content.
  const planPresenceRef = useRef<PlanPresence>("unknown");
  useEffect(() => {
    const { next, action } = planPanelDecision({
      isLoading: isPlanLoading,
      hasContent: !!content,
      isMobile,
      isPanelOpen: currentPanel === "plan",
      prev: planPresenceRef.current,
    });
    planPresenceRef.current = next;
    if (action === "open") {
      openPanel({ type: "plan" });
    } else if (action === "close") {
      closePanel();
    }
  }, [content, isMobile, isPlanLoading, currentPanel, openPanel, closePanel]);

  const title = useMemo(() => extractPlanTitle(content), [content]);
  const progress = useMemo(() => countProgress(content), [content]);

  // No active plan (including post-close): `getActivePlanContent` returns null.
  if (!content) {
    return null;
  }

  return (
    <ContentMessageInline
      icon={ListSelect}
      variant="outline"
      className="mb-3 flex w-full bg-background"
    >
      <button
        type="button"
        onClick={() => togglePanel({ type: "plan" })}
        className="flex w-full min-w-0 items-center gap-2 text-left"
      >
        <span className="min-w-0 truncate text-foreground">{title}</span>
        {progress.total > 0 && (
          <span className="shrink-0">
            {progress.done}/{progress.total} done
          </span>
        )}
      </button>
      <ContentMessageAction
        icon={Trash04}
        variant="ghost"
        size="xs"
        tooltip="Close plan"
        isLoading={isClosing}
        className="text-muted-foreground"
        onClick={() => void closePlan()}
      />
    </ContentMessageInline>
  );
});
