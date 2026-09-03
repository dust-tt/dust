import {
  Avatar,
  BellOff02,
  Button,
  ChevronDown,
  Clock,
  cn,
  Counter,
  Cube01,
  CubeOutline,
  Hoverable,
  LayoutLeft,
  MessagePlusCircle,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  Planet,
  Robot,
  SearchInput,
  Shapes,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useState } from "react";

/**
 * The workspace navigation sidebar — Figma 14969:31484.
 *
 * 320px, flat on the app background (the conversation area is the card, not
 * this). Top to bottom: a tab strip, a search + New row, then a scrolling list
 * of Agents/Skills, the Auto and Inbox cards, Pods, and the conversation
 * history grouped by age; a user row is pinned at the bottom.
 *
 * Copy and structure are read off the frame. Everything here is presentational —
 * the playground has no routing, so items are inert.
 */

const NAV_WIDTH_PX = 320;

interface InboxCardProps {
  label: string;
  count: number;
  children: React.ReactNode;
}

/** The Auto and Inbox groups are white cards on the flat nav background. */
function InboxCard({ label, count, children }: InboxCardProps) {
  return (
    <div className="mx-2 mb-3 overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="copy-sm text-foreground">{label}</span>
          <Counter value={count} size="xs" variant="highlight" />
        </div>
        <Hoverable variant="primary" className="copy-xs text-muted-foreground">
          Mark all as read
        </Hoverable>
      </div>
      <div className="border-t border-border">{children}</div>
    </div>
  );
}

function CardRow({
  icon,
  label,
  action,
}: {
  icon?: ComponentType;
  label: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <Icon20 visual={icon} />}
        <span className="copy-sm truncate text-foreground">{label}</span>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function Icon20({
  visual: Visual,
}: {
  visual: ComponentType<{ className?: string }>;
}) {
  return <Visual className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

const PODS: { label: string; icon: ComponentType; count?: number }[] = [
  { label: "Radja's_Dailies", icon: Cube01, count: 1 },
  { label: "Radja's Dust Spin-up", icon: CubeOutline },
  { label: "GTM_OS", icon: Cube01 },
  { label: "Support Weekly", icon: Cube01 },
];

const CONVERSATIONS: { group: string; items: string[] }[] = [
  {
    group: "Today",
    items: [
      "Top Singers of the Last Decade",
      "Clarifying Nonsense Input Term",
      "Editing Permissions in Dust",
      "Empty UXWriting Conversation Context",
      "Top Singers Stats and Album Art Patterns",
    ],
  },
  {
    group: "Last Week",
    items: [
      "Naming CTA for skills dropdown",
      "Metabase Spaces Usage and Hierarchy Depth",
      "Meme Concept with Panicked Alexandre Pinot",
      "Finding Dust Brand Assets",
      "Access to Google Sheets Tabs",
      "Top Singles and Listening Plan",
      "Modale UX pour présenter Dust Academy",
      "Success Agent Published Modal Copy",
    ],
  },
  {
    group: "Last Month",
    items: [
      "Requesting Time Off at Dust",
      "Daily Meeting-Summarizing AI Agent",
      "Choosing a Preferred LLM Model",
      "Error Copy for Context Limit Reached",
      "High-Value Dust Use Case Framing",
      "Giving Agent Access to Notion Page",
      "Reviewing uxWriter Instructions",
    ],
  },
];

interface NavigationSidebarProps {
  /** The conversation shown in the main column, highlighted in the list. */
  activeConversation?: string;
}

export function NavigationSidebar({
  activeConversation,
}: NavigationSidebarProps) {
  const [search, setSearch] = useState("");

  return (
    <div
      className="flex h-full shrink-0 flex-col"
      style={{ width: NAV_WIDTH_PX }}
    >
      {/* Tab strip: the workspace tab, notifications, and the layout toggle. */}
      <div className="flex h-8 shrink-0 items-center gap-1 px-3 pt-2">
        <div
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-xl px-2",
            "heading-sm text-foreground",
            // The active workspace tab carries the selected wash.
            "bg-foreground/[0.06]"
          )}
        >
          <Planet className="h-5 w-5" />
          <span>Work</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={BellOff02}
          aria-label="Notifications"
        />
        <div className="grow" />
        <Button
          variant="ghost"
          size="sm"
          icon={LayoutLeft}
          aria-label="Toggle sidebar"
        />
      </div>

      {/* Search + New. */}
      <div className="flex shrink-0 items-start gap-2 p-3">
        <SearchInput
          name="nav-search"
          placeholder="Search"
          value={search}
          onChange={setSearch}
        />
        <Button
          variant="highlight"
          size="sm"
          label="New"
          icon={MessagePlusCircle}
        />
      </div>

      <NavigationList className="min-h-0 flex-1">
        <div className="px-2">
          <NavigationListItem icon={Robot} label="Agents" />
          <NavigationListItem icon={Shapes} label="Skills" />
        </div>

        <div className="pt-3">
          <InboxCard label="Auto" count={1}>
            <CardRow
              icon={Cube01}
              label="Radja's_Dailies"
              action={
                <Hoverable
                  variant="primary"
                  className="copy-xs text-muted-foreground"
                >
                  Mark as read
                </Hoverable>
              }
            />
            <CardRow
              label="Daily Trigger Frame Request"
              action={
                <span className="copy-xs flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  08:00 AM
                </span>
              }
            />
          </InboxCard>

          <InboxCard label="Inbox" count={3}>
            <CardRow label="Global Billboard Artist Stats Request" />
            <CardRow label="Asking About PostHog Access" />
            <CardRow label="Extension browser errors and user actions" />
          </InboxCard>
        </div>

        <div className="px-2">
          <NavigationListLabel label="Pods" />
          {PODS.map((pod) => (
            <NavigationListItem
              key={pod.label}
              icon={pod.icon}
              label={pod.label}
              count={pod.count}
            />
          ))}
          <div className="px-2 py-1.5">
            <Hoverable variant="primary" className="copy-sm">
              Show all
            </Hoverable>
          </div>

          <NavigationListLabel label="Conversations" />
          {CONVERSATIONS.map((group, groupIndex) => {
            // The open conversation belongs at the top of Today, as in the frame
            // (where the conversation on screen is also the first list entry).
            const items =
              groupIndex === 0 && activeConversation
                ? [activeConversation, ...group.items]
                : group.items;

            return (
              <div key={group.group}>
                <NavigationListLabel label={group.group} />
                {items.map((item, index) => (
                  <NavigationListItem
                    key={`${item}-${index}`}
                    label={item}
                    selected={item === activeConversation}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </NavigationList>

      {/* User row, pinned. */}
      <div className="shrink-0 p-2">
        <div className="flex items-center gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-foreground/[0.04]">
          <Avatar size="sm" name="Radja" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="heading-sm truncate text-foreground">Radja</span>
            <span className="copy-xs truncate text-muted-foreground">Dust</span>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}
