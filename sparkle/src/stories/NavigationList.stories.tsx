import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  NavigationList,
  NavigationListItem,
  NavigationListItemAction,
  NavigationListCollapsibleSection,
  NavigationListLabel,
  Edit04,
  Trash01,
  DotsHorizontal,
  Plus,
  NavigationListCompactLabel,
  MessageChatSquare,
  FolderOpen,
  Folder,
  CheckDouble,
} from "../index_with_tw_base";

const meta = {
  title: "Navigation/NavigationList",
  tags: ["a11y-issues"],
  parameters: {
    docs: {
      description: {
        component: `A vertical list of navigation entries for sidebars, built from composable parts. **NavigationListItem** renders each entry with a \`label\`, optional \`icon\` or \`avatar\`, \`selected\` state, \`status\` (\`idle\`, \`unread\`, \`blocked\`, \`error\`), \`count\` badge, \`hasActivity\` dot, and a \`moreMenu\` slot (typically a **DropdownMenu** triggered by **NavigationListItemAction**). Group entries with **NavigationListLabel** / **NavigationListCompactLabel** (both support \`isSticky\`) or wrap them in a **NavigationListCollapsibleSection** (\`type\` \`collapse\` or \`static\`, with \`defaultOpen\`, \`visibleItems\`, and an \`action\` slot).

**When to use**
- For the primary sidebar navigation of an app — conversations, projects, spaces, agents.
- To present grouped, scrollable lists of items that may carry status, counts, or per-item actions.

**Guidelines**
- Use **NavigationListCollapsibleSection** for sections users may want to expand/collapse, and plain **NavigationListLabel** for always-visible grouping.
- Drive selection with the item's \`selected\` prop and keep it in sync with the active route.
- For breadcrumb-style hierarchy or tabbed content switching, use **Breadcrumbs** or **Tabs** instead.`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

const TODAY_TITLES = [
  "Project Kickoff Meeting",
  "Budget Review Discussion",
  "Weekly Sync with Team",
  "Client Requirements Gathering",
  "Sprint Retrospective",
];

const YESTERDAY_TITLES = [
  "Daily Standup",
  "Marketing Strategy Planning",
  "Code Review Session",
  "Product Launch Preparation",
  "Customer Feedback Analysis",
  "Feature Prioritization Discussion",
  "Technical Debt Assessment",
  "Sales Performance Review",
];

const INBOX_TITLES = [
  "Cross-Department Collaboration",
  "Compliance and Security Update",
  "Holiday Schedule Planning",
  "Vendor Negotiation Strategy",
  "Resource Allocation Meeting",
  "Crisis Management Scenario",
];

const CONVERSATION_SECTIONS = [
  { label: "Today", items: TODAY_TITLES },
  { label: "Yesterday", items: YESTERDAY_TITLES },
];

// Shared per-item "more" menu: a DropdownMenu triggered by
// NavigationListItemAction, with rename and delete entries.
const renderMoreMenu = () => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <NavigationListItemAction />
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem
        label="Rename"
        icon={Edit04}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      />
      <DropdownMenuItem
        label="Delete"
        icon={Trash01}
        variant="warning"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      />
    </DropdownMenuContent>
  </DropdownMenu>
);

const ConversationHistoryDemo = () => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const allItems = CONVERSATION_SECTIONS.flatMap((section) => section.items);

  return (
    <div className="h-[400px] w-[240px]">
      <NavigationList className="relative h-full w-full px-3">
        {CONVERSATION_SECTIONS.map((section) => (
          <React.Fragment key={section.label}>
            <NavigationListLabel label={section.label} isSticky />
            {section.items.map((title) => {
              const itemIndex = allItems.indexOf(title);
              return (
                <NavigationListItem
                  key={title}
                  href="#"
                  selected={itemIndex === selectedIndex}
                  onClick={(e) => {
                    // Prevent default only if it's not coming from the more menu.
                    if (!e.defaultPrevented) {
                      e.preventDefault();
                      setSelectedIndex(itemIndex);
                    }
                  }}
                  label={title}
                  className="w-full"
                />
              );
            })}
          </React.Fragment>
        ))}
      </NavigationList>
    </div>
  );
};

/**
 * A scrollable conversation sidebar: date sections built with sticky
 * **NavigationListLabel** headers, with click-driven selection kept in
 * component state.
 * @summary Grouped conversation list with sticky section labels.
 */
export const ConversationHistory: Story = {
  render: () => <ConversationHistoryDemo />,
};

/**
 * Each item can surface state at a glance: a \`status\` dot (\`unread\`,
 * \`blocked\`, \`error\`), a \`count\` badge, or a subtle \`hasActivity\`
 * indicator. \`idle\` is the default and shows nothing.
 * @summary Status dots, count badges, and activity indicators.
 */
export const WithStatusIndicators: Story = {
  render: () => (
    <div className="w-[240px]">
      <NavigationList className="relative w-full px-3">
        <NavigationListItem
          label="Weekly Sync with Team"
          status="idle"
          href="#"
          onClick={(e) => e.preventDefault()}
          className="w-full"
        />
        <NavigationListItem
          label="Budget Review Discussion"
          status="unread"
          href="#"
          onClick={(e) => e.preventDefault()}
          className="w-full"
        />
        <NavigationListItem
          label="Sprint Retrospective"
          status="blocked"
          href="#"
          onClick={(e) => e.preventDefault()}
          className="w-full"
        />
        <NavigationListItem
          label="Code Review Session"
          status="error"
          href="#"
          onClick={(e) => e.preventDefault()}
          className="w-full"
        />
        <NavigationListItem
          label="Customer Feedback Analysis"
          count={5}
          href="#"
          onClick={(e) => e.preventDefault()}
          className="w-full"
        />
        <NavigationListItem
          label="Daily Standup"
          hasActivity
          href="#"
          onClick={(e) => e.preventDefault()}
          className="w-full"
        />
      </NavigationList>
    </div>
  ),
};

/**
 * The \`moreMenu\` slot attaches a per-item **DropdownMenu** (rename,
 * delete) triggered by **NavigationListItemAction**, revealed on hover.
 * @summary Per-item more-menu with contextual actions.
 */
export const WithItemActions: Story = {
  render: () => (
    <div className="w-[240px]">
      <NavigationList className="relative w-full px-3">
        {TODAY_TITLES.map((title) => (
          <NavigationListItem
            key={title}
            href="#"
            onClick={(e) => {
              if (!e.defaultPrevented) {
                e.preventDefault();
              }
            }}
            label={title}
            className="w-full"
            moreMenu={renderMoreMenu()}
          />
        ))}
      </NavigationList>
    </div>
  ),
};

const INBOX_STATUSES = [
  "idle",
  "unread",
  "blocked",
  "error",
  "idle",
  "idle",
] as const;

const INBOX_COUNTS: Array<number | undefined> = [
  undefined,
  undefined,
  undefined,
  undefined,
  5,
  12,
];

const AGENTS = [
  { handle: "alex", name: "Alex", emoji: "🤖", color: "bg-blue-300" },
  { handle: "sam", name: "Sam", emoji: "🎨", color: "bg-violet-300" },
  { handle: "taylor", name: "Taylor", emoji: "🚀", color: "bg-pink-300" },
  { handle: "jordan", name: "Jordan", emoji: "⚡", color: "bg-orange-300" },
  { handle: "riley", name: "Riley", emoji: "🌟", color: "bg-golden-300" },
  { handle: "casey", name: "Casey", emoji: "💡", color: "bg-emerald-300" },
];

const CollapsibleSectionDemo = () => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const allItems = CONVERSATION_SECTIONS.flatMap((section) => section.items);

  return (
    <div className="flex h-[800px] w-[260px] flex-col border-r border-border bg-muted-background">
      <NavigationList className="h-full w-[260px]">
        <NavigationListCollapsibleSection
          label="Inbox"
          className="border-b border-t border-border bg-background/50 px-2 pb-2"
          action={
            <Button
              size="xmini"
              icon={CheckDouble}
              variant="ghost"
              aria-label="Mark all as read"
              tooltip="Mark all as read"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
          }
        >
          {INBOX_TITLES.map((title, index) => (
            <NavigationListItem
              key={title}
              href="#"
              status={INBOX_STATUSES[index % 6]}
              count={INBOX_COUNTS[index % 6]}
              onClick={(e) => {
                if (!e.defaultPrevented) {
                  e.preventDefault();
                }
              }}
              label={title}
              className="w-full"
              moreMenu={renderMoreMenu()}
            />
          ))}
        </NavigationListCollapsibleSection>
        <NavigationListCollapsibleSection
          label="Projects"
          type="collapse"
          defaultOpen={true}
          visibleItems={4}
          className="max-w-full px-2"
          action={
            <>
              <Button
                size="xmini"
                icon={Plus}
                variant="ghost"
                aria-label="New project"
                tooltip="New project"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
              <Button
                size="xmini"
                icon={DotsHorizontal}
                variant="ghost"
                aria-label="More options"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
            </>
          }
        >
          <NavigationListItem
            icon={FolderOpen}
            label="Engineering"
            count={12}
            href="#"
            hasActivity
            onClick={(e) => {
              e.preventDefault();
            }}
          />
          <NavigationListItem
            icon={FolderOpen}
            label="Design"
            count={8}
            href="#"
            hasActivity
            onClick={(e) => {
              e.preventDefault();
            }}
          />
          <NavigationListItem
            icon={FolderOpen}
            label="Product"
            count={5}
            href="#"
            hasActivity
            onClick={(e) => {
              e.preventDefault();
            }}
          />
          <NavigationListItem
            icon={FolderOpen}
            label="Company"
            href="#"
            count={3}
            hasActivity
            onClick={(e) => {
              e.preventDefault();
            }}
          />
          <NavigationListItem
            icon={Folder}
            label="Operations"
            href="#"
            hasActivity
            onClick={(e) => {
              e.preventDefault();
            }}
          />
          <NavigationListItem
            icon={Folder}
            label="Fundraising"
            href="#"
            onClick={(e) => {
              e.preventDefault();
            }}
          />
          <NavigationListItem
            icon={Folder}
            label="Marketing"
            href="#"
            onClick={(e) => {
              e.preventDefault();
            }}
          />
        </NavigationListCollapsibleSection>
        <NavigationListCollapsibleSection
          label="Conversations"
          type="static"
          defaultOpen={true}
          className="px-2"
          action={
            <>
              <Button
                size="xmini"
                icon={MessageChatSquare}
                variant="ghost"
                aria-label="New conversation"
                tooltip="New Conversation"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
              <Button
                size="xmini"
                icon={DotsHorizontal}
                variant="ghost"
                aria-label="More options"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
            </>
          }
        >
          {CONVERSATION_SECTIONS.map((section) => (
            <React.Fragment key={section.label}>
              <NavigationListCompactLabel label={section.label} isSticky />
              {section.items.map((title, index) => {
                const itemIndex = allItems.indexOf(title);
                return (
                  <NavigationListItem
                    key={title}
                    href="#"
                    selected={itemIndex === selectedIndex}
                    hasActivity={index % 3 === 0}
                    onClick={(e) => {
                      if (!e.defaultPrevented) {
                        e.preventDefault();
                        setSelectedIndex(itemIndex);
                      }
                    }}
                    label={title}
                    className="w-full"
                    moreMenu={renderMoreMenu()}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </NavigationListCollapsibleSection>
        <NavigationListCollapsibleSection
          label="Agents"
          type="collapse"
          defaultOpen={true}
          action={
            <>
              <Button
                size="xmini"
                icon={Plus}
                variant="ghost"
                aria-label="New agent"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
              <Button
                size="xmini"
                icon={DotsHorizontal}
                variant="ghost"
                aria-label="More options"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
            </>
          }
        >
          {AGENTS.map((agent) => (
            <NavigationListItem
              key={agent.handle}
              href="#"
              selected={false}
              onClick={(e) => {
                e.preventDefault();
              }}
              label={agent.name}
              avatar={
                <Avatar
                  size="xxs"
                  name={agent.handle}
                  emoji={agent.emoji}
                  backgroundColor={agent.color}
                />
              }
              className="w-full"
            />
          ))}
        </NavigationListCollapsibleSection>
      </NavigationList>
    </div>
  );
};

/**
 * A full sidebar built from **NavigationListCollapsibleSection**s showing
 * the section variants together: a bordered inbox with a header action,
 * a \`collapse\` section clamped with \`visibleItems\`, a \`static\`
 * section with compact sticky labels, and an avatar-based agents section.
 * @summary Collapsible section variants composed into a sidebar.
 */
export const CollapsibleSection: Story = {
  render: () => <CollapsibleSectionDemo />,
};
