import { File02, ListSelect, Markdown, Spinner } from "@dust-tt/sparkle";
import { useMemo } from "react";
import type { Components } from "react-markdown";

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
 * The panel has no header of its own: the `Credit usage` / `Files` / `Plan` CTAs
 * stay put in the full-width top bar and become the panel's tab strip when it
 * opens (see `ConversationTopBar`), so the panel slides open directly underneath
 * them and nothing jumps.
 *
 * The plan has its own tab and renders straight into the body, with no
 * breadcrumb. `Plan.md` still shows up in the Files list because it really is a
 * conversation file, but selecting it switches to the Plan tab rather than
 * rendering a second copy of the same content inside Files.
 */

export const PLAN_FILE_NAME = "Plan.md";

export type SidePanelTab = "credits" | "files" | "plan";

interface ConversationSidePanelProps {
  tab: SidePanelTab;
  onTabChange: (tab: SidePanelTab) => void;
  creditsUsage: CreditsUsage;
  /** The active plan's markdown, or null when there is no plan. */
  planContent: string | null;
  isPlanLoading?: boolean;
  /** Marks the first open task as the step in flight. */
  isPlanRunning?: boolean;
}

export function ConversationSidePanel({
  tab,
  onTabChange,
  creditsUsage,
  planContent,
  isPlanLoading = false,
  isPlanRunning = false,
}: ConversationSidePanelProps) {
  return (
    <div className="flex h-full flex-col">
      {/* No header: the top-bar CTAs are this panel's tab strip, and the panel
          opens directly underneath them. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tab === "credits" && <CreditUsageGauge usage={creditsUsage} />}
        {tab === "files" && (
          <FilesTab
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

function FilesTab({
  hasPlan,
  onOpenPlan,
}: {
  hasPlan: boolean;
  onOpenPlan: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Figma section header: 12px / leading-16, muted-foreground, name bold. */}
      <div className="text-xs font-bold leading-4 text-muted-foreground">
        All files
      </div>
      {hasPlan ? (
        <button
          type="button"
          onClick={onOpenPlan}
          className="flex items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted-background"
        >
          <ListSelect className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate text-sm text-foreground">
            {PLAN_FILE_NAME}
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <File02 className="h-4 w-4 shrink-0" />
          No files in this conversation yet.
        </div>
      )}
    </div>
  );
}

function PlanBody({
  content,
  isLoading,
  isRunning,
}: {
  content: string | null;
  isLoading: boolean;
  isRunning: boolean;
}) {
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
        >
          {children}
        </PlanMarkdownListItem>
      ),
    }),
    [taskStates]
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
