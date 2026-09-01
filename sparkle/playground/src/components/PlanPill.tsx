import {
  ContentMessageAction,
  ContentMessageInline,
  ListSelect,
  Trash04,
} from "@dust-tt/sparkle";
import React, { useMemo } from "react";

import { countProgress, extractPlanTitle } from "./planUtils";

/**
 * Mirrors front's
 * `components/assistant/conversation/plan_mode/PlanCard.tsx`.
 *
 * Production renders this inside the input bar wrapper, directly above the
 * composer, and it is the only entry point to the plan panel. The panel
 * open/close is driven off the plan's *presence* (see `planPanelDecision` in
 * front) rather than off a specific event; the story owns that here.
 */

interface PlanPillProps {
  content: string | null;
  onToggle: () => void;
  onClose: () => void;
  isClosing?: boolean;
}

export const PlanPill = React.memo(function PlanPill({
  content,
  onToggle,
  onClose,
  isClosing = false,
}: PlanPillProps) {
  const title = useMemo(() => extractPlanTitle(content), [content]);
  const progress = useMemo(() => countProgress(content), [content]);

  // No active plan (including post-close).
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
        onClick={onToggle}
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
        onClick={onClose}
      />
    </ContentMessageInline>
  );
});
