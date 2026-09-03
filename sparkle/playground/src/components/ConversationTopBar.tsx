import {
  Button,
  cn,
  CoinsStacked02,
  DotsHorizontal,
  Folder,
  ListSelect,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
 * The three entry points are filter chips: `size="xs"` `ghost` buttons, the
 * geometry `FilterChips` renders.
 *
 * One deliberate departure from it: `FilterChips` marks the selected chip with
 * `variant="primary"`, which is a solid stone gradient and reads as a black
 * button in a light top bar. The open panel's chip keeps `ghost` and takes
 * `transparency-selected` instead — the flat 6% foreground wash from Figma
 * 14969:31878, the same token `OptionCard` uses for its selected row.
 *
 * `FilterChips` itself cannot be used here at all. It takes plain strings, so
 * there is nowhere to put an icon or the `3/5`; it owns its selection in local
 * state, which would fight the panel state that is the real source of truth; and
 * it early-returns when the selected chip is re-clicked, so toggling a panel shut
 * would not work.
 *
 * The Plan chip only exists while a plan does. Closing a plan — from the panel
 * toolbar's bin, or by restarting — plays its exit (a slight dip, then away to
 * the top right) before it unmounts. Keyframes live in `index.css`; the duration
 * is here so it and the unmount timer cannot drift apart.
 */

const PLAN_CTA_EXIT_MS = 840;

/**
 * The transform-and-fade above does not touch layout, so on its own the chip
 * holds its box for the whole exit and the space then vanishes in a single
 * frame — the remaining chips snap to the right. These collapse the space it
 * occupies instead, so they glide across. Delayed so the squeeze starts once
 * the chip is already well on its way out, and timed to land together
 * (240 + 600 = 840).
 *
 * The gap is closed too: with `gap-2` between chips, a zero-width box still
 * leaves 8px behind.
 */
const PLAN_CTA_COLLAPSE_MS = 600;
const PLAN_CTA_COLLAPSE_DELAY_MS = 240;
const PANEL_CHIP_GAP_PX = 8;

interface PanelChipProps {
  label: string;
  icon: ComponentType;
  isSelected: boolean;
  /** Appended to the label, e.g. the plan's `3/5`. */
  progress?: string;
  onClick: () => void;
}

function PanelChip({
  label,
  icon,
  isSelected,
  progress,
  onClick,
}: PanelChipProps) {
  return (
    <Button
      size="xs"
      variant="ghost"
      icon={icon}
      label={progress ? `${label} ${progress}` : label}
      onClick={onClick}
      aria-pressed={isSelected}
      // Figma: --transparency-selected, rgba(0, 0, 0, 0.06). `ghost` sets no
      // resting background, so this lands without fighting the variant.
      className={cn(isSelected && "bg-foreground/[0.06]")}
    />
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

  // Freeze the width the chip is collapsing from, then release it on the next
  // frame so the transition has two values to interpolate between. `width: auto`
  // is not animatable, so the measurement is unavoidable.
  const planChipRef = useRef<HTMLDivElement>(null);
  const [collapseWidthPx, setCollapseWidthPx] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!isPlanExiting) {
      setCollapseWidthPx(null);
      return;
    }
    const element = planChipRef.current;
    if (!element) {
      return;
    }
    setCollapseWidthPx(element.offsetWidth);
    const frame = requestAnimationFrame(() => setCollapseWidthPx(0));
    return () => cancelAnimationFrame(frame);
  }, [isPlanExiting]);

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
          <PanelChip
            label="Credits"
            icon={CoinsStacked02}
            isSelected={activeTab === "credits"}
            onClick={() => onSelectTab("credits")}
          />
          <PanelChip
            label="Files"
            icon={Folder}
            isSelected={activeTab === "files"}
            onClick={() => onSelectTab("files")}
          />
          {isPlanMounted && (
            <div
              ref={planChipRef}
              className={cn(isPlanExiting && "animate-plan-cta-exit")}
              style={
                isPlanExiting
                  ? {
                      animationDuration: `${PLAN_CTA_EXIT_MS}ms`,
                      // Not `transition-*` utilities: tw-animate-css remaps
                      // `delay-*` onto animation-delay, so a transition delay
                      // has to be written out here.
                      transition: `width ${PLAN_CTA_COLLAPSE_MS}ms cubic-bezier(0.4, 0, 0.2, 1) ${PLAN_CTA_COLLAPSE_DELAY_MS}ms, margin-left ${PLAN_CTA_COLLAPSE_MS}ms cubic-bezier(0.4, 0, 0.2, 1) ${PLAN_CTA_COLLAPSE_DELAY_MS}ms`,
                      ...(collapseWidthPx === null
                        ? {}
                        : {
                            width: collapseWidthPx,
                            marginLeft:
                              collapseWidthPx === 0 ? -PANEL_CHIP_GAP_PX : 0,
                          }),
                    }
                  : undefined
              }
            >
              <PanelChip
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
