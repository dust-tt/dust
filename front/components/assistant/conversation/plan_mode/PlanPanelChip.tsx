import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { PlanPresence } from "@app/components/assistant/conversation/plan_mode/utils";
import {
  countProgress,
  planPanelDecision,
} from "@app/components/assistant/conversation/plan_mode/utils";
import { usePlanFile } from "@app/hooks/conversations/usePlanFile";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { PLAN_SIDE_PANEL_TYPE } from "@app/types/conversation_side_panel";
import { FilterChip, ListSelect } from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef } from "react";

interface PlanPanelChipProps {
  conversationId: string;
  workspaceId: string;
}

// Title bar entry point for the plan panel: shows progress and toggles the panel. Mount it keyed
// by conversation so the presence tracking below restarts on navigation.
export function PlanPanelChip({
  conversationId,
  workspaceId,
}: PlanPanelChipProps) {
  const { hasFeature } = useFeatureFlags();
  const isPlanModeEnabled = hasFeature("plan_mode");
  const { content, isPlanLoading } = usePlanFile({
    // Skip the fetch entirely for workspaces without the plan_mode feature flag.
    conversationId: isPlanModeEnabled ? conversationId : null,
    workspaceId,
  });
  const { currentPanel, isPanelClosing, openPanel, togglePanel, closePanel } =
    useConversationSidePanelContext();
  const isMobile = useIsMobile();
  const isPlanPanelOpen = currentPanel === PLAN_SIDE_PANEL_TYPE;
  // The chip unselects as soon as the panel starts closing; the decision below keeps seeing the
  // panel as open until it is gone.
  const isChipSelected = isPlanPanelOpen && !isPanelClosing;

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
      openPanel({ type: PLAN_SIDE_PANEL_TYPE });
    } else if (action === "close") {
      closePanel();
    }
  }, [
    content,
    isMobile,
    isPlanLoading,
    isPlanPanelOpen,
    openPanel,
    closePanel,
  ]);

  const progress = useMemo(() => countProgress(content), [content]);

  // No active plan (including post-close): `getActivePlanContent` returns null.
  if (!content) {
    return null;
  }

  const label =
    progress.total > 0 ? `Plan ${progress.done}/${progress.total}` : "Plan";

  return (
    <FilterChip
      label={isMobile ? undefined : label}
      tooltip={isMobile ? label : undefined}
      icon={ListSelect}
      variant="secondary"
      isSelected={isChipSelected}
      onClick={() => togglePanel({ type: PLAN_SIDE_PANEL_TYPE })}
    />
  );
}
