import {
  Button,
  cn,
  Download01,
  Markdown,
  PencilLine,
  Spinner,
  Trash04,
  XClose,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";
import type { Components } from "react-markdown";

import { ConversationFilesTab } from "./ConversationFilesTab";
import { type CreditsUsage, CreditUsageGauge } from "./CreditUsageGauge";
import {
  contentHash,
  normalizePlanMarkdown,
  planTaskStates,
} from "./planUtils";
import { PlanMarkdownList, PlanMarkdownListItem } from "./PlanTaskList";

/**
 * The conversation side panel — Figma 14797:120638 (three tabs) on top of
 * 14800:125175 (the panel/top-bar simplification).
 *
 * One panel per type, following front's `ConversationSidePanelContent`.
 *
 * Unlike front, there is no header bar naming the panel: the content starts
 * straight away and closing is a floating outlined button over the top-right
 * corner. Which panel is open is shown by its top-bar button carrying the
 * selected wash, so the name does not need repeating.
 *
 * `plan.md` shows up in the Files list because it really is a conversation file;
 * selecting it opens the Plan panel rather than rendering a second copy of the
 * same content inside Files — see `ConversationFilesTab` (Figma 14969:31109).
 */

export { PLAN_FILE_NAME } from "./ConversationFilesTab";

export type SidePanelTab = "credits" | "files" | "plan";

interface ConversationSidePanelProps {
  tab: SidePanelTab;
  onTabChange: (tab: SidePanelTab) => void;
  onClose: () => void;
  creditsUsage: CreditsUsage;
  /** The active plan's markdown, or null when there is no plan. */
  planContent: string | null;
  isPlanLoading?: boolean;
  /** Marks the first open task as the step in flight. */
  isPlanRunning?: boolean;
  /** production's `close_plan` — retires the plan. */
  onClosePlan?: () => void;
}

export function ConversationSidePanel({
  tab,
  onTabChange,
  onClose,
  creditsUsage,
  planContent,
  isPlanLoading = false,
  isPlanRunning = false,
  onClosePlan,
}: ConversationSidePanelProps) {
  return (
    <div
      className={cn(
        "relative flex h-full flex-col bg-background",
        // Figma: 0 1px 1px -0.5px rgb(0 0 0 / 0.06), 0 0 0 1px rgb(0 0 0 / 0.06)
        "shadow-[0px_1px_1px_-0.5px_rgba(0,0,0,0.06),0px_0px_0px_1px_rgba(0,0,0,0.06)]"
      )}
    >
      {/* Both floating controls sit outside the scroll container so they stay
          put while the panel scrolls. */}
      <div className="absolute right-3 top-3 z-10">
        <Button variant="outline" size="xs" onClick={onClose} icon={XClose} />
      </div>

      {tab === "plan" && planContent && (
        <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
          <div className="flex items-center gap-6 rounded-xl border border-border-dark bg-muted-background px-3 py-2">
            <Button
              variant="ghost"
              size="xs"
              icon={PencilLine}
              tooltip="Edit plan"
            />
            <Button
              variant="ghost"
              size="xs"
              icon={Download01}
              tooltip="Download"
            />
            <Button
              variant="ghost"
              size="xs"
              icon={Trash04}
              tooltip="Close plan"
              onClick={onClosePlan}
            />
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tab === "credits" && <CreditUsageGauge usage={creditsUsage} />}
        {tab === "files" && (
          <ConversationFilesTab
            hasPlan={!!planContent}
            onOpenPlan={() => onTabChange("plan")}
          />
        )}
        {tab === "plan" && (
          <PlanBody
            content={planContent}
            isLoading={isPlanLoading}
            isRunning={isPlanRunning}
          />
        )}
      </div>
    </div>
  );
}

/**
 * How long the staggered task reveal is allowed to run. After this, rows render
 * without animation so the per-task `edit_plan` remounts (keyed on the content
 * hash) do not replay the whole stagger on every tick.
 */
const REVEAL_WINDOW_MS = 1200;

function PlanBody({
  content,
  isLoading,
  isRunning,
}: {
  content: string | null;
  isLoading: boolean;
  isRunning: boolean;
}) {
  // Mount-scoped: showing the plan again (opening the panel on this tab) remounts
  // PlanBody and replays the reveal, which is the intent.
  const [isRevealing, setIsRevealing] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setIsRevealing(false),
      REVEAL_WINDOW_MS
    );
    return () => window.clearTimeout(timer);
  }, []);

  const markdownKey = useMemo(
    () => (content ? contentHash(content) : ""),
    [content]
  );

  // Task rows get status badges instead of checkboxes — the tasks are the
  // agent's, not the user's. See PlanTaskList / Figma 14800:126251.
  const taskStates = useMemo(
    () => planTaskStates(content, { isRunning }),
    [content, isRunning]
  );
  const normalizedContent = useMemo(
    () => (content ? normalizePlanMarkdown(content) : null),
    [content]
  );
  const markdownComponents = useMemo<Components>(
    () => ({
      // The removed header used to read `Plan: {title}` (front's
      // ConversationPlanModePanel); the frame moves that prefix into the body's
      // own h1. Classes mirror sparkle's H1Block, which is not exported:
      // headingSpacing[1] + markdownHeaderClasses.h1 + the default text colour.
      h1: ({ children }) => (
        <h1 className="heading-2xl pb-2 pt-4 text-foreground">
          Plan: {children}
        </h1>
      ),
      // The badge carries the state now, so drop the checkbox entirely.
      input: () => null,
      ul: ({ children, className }) => (
        <PlanMarkdownList className={className}>{children}</PlanMarkdownList>
      ),
      li: ({ children, className, index }) => (
        <PlanMarkdownListItem
          className={className}
          index={index}
          states={taskStates}
          isRevealing={isRevealing}
        >
          {children}
        </PlanMarkdownListItem>
      ),
    }),
    [taskStates, isRevealing]
  );

  if (isLoading && !content) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!content) {
    return (
      <div className="text-sm text-muted-foreground">
        No active plan for this conversation.
      </div>
    );
  }

  return (
    // Remount on each edit: Sparkle's `Markdown` memoizes AST nodes for streaming
    // reveal and can keep stale children when the content prop is replaced.
    <Markdown
      key={markdownKey}
      content={normalizedContent ?? ""}
      additionalMarkdownComponents={markdownComponents}
    />
  );
}
