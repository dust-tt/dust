import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { PlanPresence } from "@app/components/assistant/conversation/plan_mode/utils";
import {
  countProgress,
  planPanelDecision,
} from "@app/components/assistant/conversation/plan_mode/utils";
import { usePlanFile } from "@app/hooks/conversations/usePlanFile";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { Button, ListSelect } from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef } from "react";

interface PlanPanelButtonProps {
  conversationId: string;
  workspaceId: string;
}

// Title bar entry point for the plan panel: shows progress and toggles the panel. Mount it keyed
// by conversation so the presence tracking below restarts on navigation.
export function PlanPanelButton({
  conversationId,
  workspaceId,
}: PlanPanelButtonProps) {
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
  const isPlanPanelOpen = currentPanel === "plan";

  // Single owner of the plan panel: open when the plan appears, close when it goes away. Driving
  // this off `content` (not a specific event) keeps it correct however the change arrived (live
  // action event, cross-client `plan_updated`, reconnect refetch). Must stay above the early return
  // so the close transition is observed when the button unmounts its content.
  const planPresenceRef = useRef<PlanPresence>("unknown");
  useEffect(() => {
    const { next, action } = planPanelDecision({
      isLoading: isPlanLoading,
      hasContent: !!content,
      isMobile,
      isPanelOpen: isPlanPanelOpen,
      prev: planPresenceRef.current,
    });
    planPresenceRef.current = next;
    if (action === "open") {
      openPanel({ type: "plan" });
    } else if (action === "close") {
      closePanel();
    }
  }, [content, isMobile, isPlanLoading, isPlanPanelOpen, openPanel, closePanel]);

  const progress = useMemo(() => countProgress(content), [content]);

  // No active plan (including post-close): `getActivePlanContent` returns null.
  if (!content) {
    return null;
  }

  const label =
    progress.total > 0 ? `Plan ${progress.done}/${progress.total}` : "Plan";

  return (
    <Button
      size="sm"
      variant="ghost"
      icon={ListSelect}
      label={isMobile ? undefined : label}
      tooltip={isMobile ? label : undefined}
      aria-pressed={isPlanPanelOpen}
      className={isPlanPanelOpen ? "bg-foreground/[0.06]" : undefined}
      onClick={() => togglePanel({ type: "plan" })}
    />
  );
}
