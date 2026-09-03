import {
  Button,
  cn,
  CoinsStacked02,
  DotsHorizontal,
  Folder,
  Icon,
  ListSelect,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";

import { AppLayoutTitle } from "./AppLayoutTitle";
import type { SidePanelTab } from "./ConversationSidePanel";
import { PlanRunningIcon } from "./PlanRunningIcon";

/**
 * Conversation top bar — Figma 14969:31878.
 *
 * Layout follows front's `ConversationTitle`: the bar lives *inside* the
 * conversation column, so the panel buttons sit at the right edge of the
 * conversation rather than of the window. Title then the `...` menu on the left,
 * the three panel entry points on the right.
 *
 * The open panel's button carries `transparency-selected` — a flat 6% foreground
 * overlay, the same token `OptionCard` uses for its selected row. Not a weight
 * change: `ghost` is already `text-foreground`, so weight alone had nothing to
 * work against.
 *
 * The Plan button only exists while a plan does. Closing a plan — from the panel
 * toolbar's bin, or by restarting — plays its exit (a slight dip, then away to
 * the top right) before it unmounts. Keyframes live in `index.css`; the duration
 * is here so it and the unmount timer cannot drift apart.
 *
 * The buttons are hand-rolled rather than sparkle `Button`s because the frame
 * puts two text runs inside one button — the label plus the `3/5` progress in
 * smaller muted type — which the `label`-string API cannot express. Geometry
 * mirrors sparkle's `size="xs"` ghost button exactly (h-6, rounded-[9px], px-2,
 * gap-1.5, 14px/500).
 */

const PLAN_CTA_EXIT_MS = 840;

interface PanelButtonProps {
  label: string;
  icon: ComponentType;
  isSelected: boolean;
  /** Rendered after the label in smaller muted type, e.g. `3/5`. */
  progress?: string;
  onClick: () => void;
}

function PanelButton({
  label,
  icon,
  isSelected,
  progress,
  onClick,
}: PanelButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={cn(
        "inline-flex h-6 shrink-0 items-center justify-center gap-1.5 rounded-[9px] px-2",
        "text-sm font-medium leading-4 tracking-[-0.28px] text-foreground",
        "transition-colors hover:bg-foreground/[0.04]",
        // Figma: --transparency-selected, rgba(0,0,0,0.06).
        isSelected && "bg-foreground/[0.06]"
      )}
    >
      <Icon visual={icon} size="xs" />
      <span className="truncate">{label}</span>
      {progress && (
        <span className="copy-xs text-muted-foreground">{progress}</span>
      )}
    </button>
  );
}

interface ConversationTopBarProps {
  title: string;
  /**
   * Whether a plan exists. The Plan button only exists alongside a plan; when
   * one is closed the button plays its exit and then unmounts.
   */
  hasPlan?: boolean;
  /** The open panel, or null — its button renders selected. */
  activeTab: SidePanelTab | null;
  onSelectTab: (tab: SidePanelTab) => void;
  /** Production opens the rename dialog from the title. */
  onTitleClick?: () => void;
  /** Animates the Plan glyph while the agent is working through the plan. */
  isPlanRunning?: boolean;
  /** Shown on the Plan button as `done/total` when a plan exists. */
  planProgress?: { done: number; total: number } | null;
}

export function ConversationTopBar({
  title,
  hasPlan = false,
  activeTab,
  onSelectTab,
  onTitleClick,
  isPlanRunning = false,
  planProgress = null,
}: ConversationTopBarProps) {
  // Kept mounted across the transition to false so the exit can play, then
  // removed on a timer rather than on `animationend`: if the animation never
  // starts — reduced-motion, an interrupted class application — that event never
  // fires and the button would linger for good. The timer always removes it.
  const [isPlanMounted, setIsPlanMounted] = useState(hasPlan);
  useEffect(() => {
    if (hasPlan) {
      setIsPlanMounted(true);
      return;
    }
    if (!isPlanMounted) {
      return;
    }
    const timer = window.setTimeout(
      () => setIsPlanMounted(false),
      PLAN_CTA_EXIT_MS
    );
    return () => window.clearTimeout(timer);
  }, [hasPlan, isPlanMounted]);
  const isPlanExiting = isPlanMounted && !hasPlan;

  return (
    <AppLayoutTitle>
      <div className="grid h-full min-w-0 max-w-full grid-cols-[1fr_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            label={title}
            onClick={onTitleClick}
            className="min-w-0"
          />
          <Button
            size="sm"
            variant="ghost"
            icon={DotsHorizontal}
            aria-label="Conversation menu"
          />
        </div>
        <div className="flex items-center gap-2">
          <PanelButton
            label="Credits"
            icon={CoinsStacked02}
            isSelected={activeTab === "credits"}
            onClick={() => onSelectTab("credits")}
          />
          <PanelButton
            label="Files"
            icon={Folder}
            isSelected={activeTab === "files"}
            onClick={() => onSelectTab("files")}
          />
          {isPlanMounted && (
            <div
              className={cn(isPlanExiting && "animate-plan-cta-exit")}
              style={
                isPlanExiting
                  ? { animationDuration: `${PLAN_CTA_EXIT_MS}ms` }
                  : undefined
              }
            >
              <PanelButton
                label="Plan"
                icon={isPlanRunning ? PlanRunningIcon : ListSelect}
                isSelected={activeTab === "plan"}
                progress={
                  planProgress && planProgress.total > 0
                    ? `${planProgress.done}/${planProgress.total}`
                    : undefined
                }
                onClick={() => onSelectTab("plan")}
              />
            </div>
          )}
        </div>
      </div>
    </AppLayoutTitle>
  );
}
