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

import { AppLayoutTitle } from "./AppLayoutTitle";
import type { SidePanelTab } from "./ConversationSidePanel";

/**
 * Mirrors front's `components/assistant/conversation/ConversationTitle.tsx`
 * (breadcrumbs left, actions right), with the simplification from Figma
 * 14800:125175.
 *
 * The top bar spans the full width, so the `Credit usage` / `Files` / `Plan` CTAs
 * already sit above the side-panel column: the panel opens *underneath them* and the
 * same buttons become its tab strip — active gets a bold label and a 2px
 * `bg-foreground` bar flush with the bar's bottom edge. Nothing moves between
 * the two states, which is the whole point.
 *
 * The `...` menu sits to the left of the title, and the title is plain — no space
 * breadcrumb — both as in the frame, which shows `... Top Singers of the Last
 * Decade`.
 */

interface PanelTabButtonProps {
  label: string;
  icon: ComponentType;
  /** Tab mode: the panel is open, so these read as tabs rather than buttons. */
  isTabMode: boolean;
  isActive: boolean;
  onClick: () => void;
}

function PanelTabButton({
  label,
  icon,
  isTabMode,
  isActive,
  onClick,
}: PanelTabButtonProps) {
  // One element across both states — only classes change, so opening the panel
  // never remounts or reflows the CTA.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isTabMode ? isActive : undefined}
      className={cn(
        "relative flex h-full items-center gap-1.5 px-3 text-sm tracking-[-0.28px] transition-colors",
        // The active bar sits flush on the bar's bottom edge, just above
        // AppLayoutTitle's separator.
        "after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-foreground",
        "after:transition-opacity after:duration-200",
        isTabMode && isActive ? "after:opacity-100" : "after:opacity-0",
        isTabMode && isActive
          ? "font-semibold text-foreground"
          : "font-medium text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon visual={icon} size="xs" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

interface ConversationTopBarProps {
  title: string;
  /** The open panel's tab, or null when the panel is closed. */
  activeTab: SidePanelTab | null;
  onSelectTab: (tab: SidePanelTab) => void;
  /** Production opens the rename dialog from the title. */
  onTitleClick?: () => void;
}

export function ConversationTopBar({
  title,
  activeTab,
  onSelectTab,
  onTitleClick,
}: ConversationTopBarProps) {
  const isPanelOpen = activeTab !== null;

  return (
    <AppLayoutTitle className="px-0">
      <div className="grid h-full min-w-0 max-w-full grid-cols-[1fr_auto] items-center gap-3 pl-2">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            icon={DotsHorizontal}
            aria-label="Conversation menu"
          />
          <Button
            size="sm"
            variant="ghost"
            label={title}
            onClick={onTitleClick}
            className="min-w-0"
          />
        </div>
        <div className="flex h-full items-stretch gap-1 pr-2">
          <PanelTabButton
            label="Credit usage"
            icon={CoinsStacked02}
            isTabMode={isPanelOpen}
            isActive={activeTab === "credits"}
            onClick={() => onSelectTab("credits")}
          />
          <PanelTabButton
            label="Files"
            icon={Folder}
            isTabMode={isPanelOpen}
            isActive={activeTab === "files"}
            onClick={() => onSelectTab("files")}
          />
          <PanelTabButton
            label="Plan"
            icon={ListSelect}
            isTabMode={isPanelOpen}
            isActive={activeTab === "plan"}
            onClick={() => onSelectTab("plan")}
          />
        </div>
      </div>
    </AppLayoutTitle>
  );
}
