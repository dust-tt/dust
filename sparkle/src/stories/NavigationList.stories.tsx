import type { Meta } from "@storybook/react";
import React, { useEffect, useState } from "react";

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
  Maximize01,
  Minimize01,
} from "../index_with_tw_base";
import type { NavigationListItemStatus } from "../components/NavigationList";

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

const getRandomTitles = (count: number) => {
  const shuffled = fakeTitles.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

export const Demo = () => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [conversationTitles, setConversationTitles] = useState<
    { label: string; items: string[] }[]
  >([]);

  useEffect(() => {
    setConversationTitles([
      { label: "Today", items: getRandomTitles(5) },
      { label: "Yesterday", items: getRandomTitles(10) },
    ]);
  }, []);

  const allItems = conversationTitles.flatMap((section) => section.items);

  const getMoreMenu = (title: string) => (
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
            // Add rename logic here
          }}
        />
        <DropdownMenuItem
          label="Delete"
          icon={Trash01}
          variant="warning"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Add delete logic here
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex h-[400px] w-full flex-row gap-12">
      <div className="h-[400px] w-[240px]">
        <NavigationList className="relative h-full w-full px-3">
          {conversationTitles.map((section, sectionIndex) => (
            <React.Fragment key={sectionIndex}>
              <NavigationListLabel label={section.label} />
              {section.items.map((title, index) => {
                const itemIndex = allItems.indexOf(title);
                // Add status based on index for demonstration
                const getStatus = (idx: number): NavigationListItemStatus => {
                  if (idx % 7 === 0) {
                    return "error";
                  }
                  if (idx % 5 === 0) {
                    return "unread";
                  }
                  if (idx % 3 === 0) {
                    return "blocked";
                  }
                  return "idle";
                };
                return (
                  <NavigationListItem
                    key={index}
                    href={index % 2 === 0 ? "#" : undefined}
                    selected={itemIndex === selectedIndex}
                    onClick={(e) => {
                      // Prevent default only if it's not coming from the more menu
                      if (!e.defaultPrevented) {
                        e.preventDefault();
                        setSelectedIndex(itemIndex);
                      }
                    }}
                    label={title}
                    className="w-full"
                    moreMenu={getMoreMenu(title)}
                    status={getStatus(index)}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </NavigationList>
      </div>
      <div className="h-[400px] w-[240px]">
        <NavigationList className="relative h-full w-full px-3">
          {conversationTitles.map((section, sectionIndex) => (
            <React.Fragment key={sectionIndex}>
              <NavigationListLabel label={section.label} isSticky />
              {section.items.map((title, index) => {
                const itemIndex = allItems.indexOf(title);
                // Add status based on index for demonstration.
                const getStatus = (idx: number): NavigationListItemStatus => {
                  if (idx % 7 === 0) {
                    return "error";
                  }
                  if (idx % 5 === 0) {
                    return "unread";
                  }
                  if (idx % 3 === 0) {
                    return "blocked";
                  }
                  return "idle";
                };
                return (
                  <NavigationListItem
                    key={index}
                    href={index % 2 === 0 ? "#" : undefined}
                    selected={itemIndex === selectedIndex}
                    onClick={(e) => {
                      // Prevent default only if it's not coming from the more menu
                      if (!e.defaultPrevented) {
                        e.preventDefault();
                        setSelectedIndex(itemIndex);
                      }
                    }}
                    label={title}
                    className="w-full"
                    moreMenu={getMoreMenu(title)}
                    status={getStatus(index)}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </NavigationList>
      </div>
    </div>
  );
};

export const CollapsibleSection = () => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [conversationTitles, setConversationTitles] = useState<
    { label: string; items: string[] }[]
  >([]);

  useEffect(() => {
    setConversationTitles([
      { label: "Today", items: getRandomTitles(5) },
      { label: "Yesterday", items: getRandomTitles(10) },
      { label: "Last Week", items: getRandomTitles(8) },
    ]);
  }, []);

  const allItems = conversationTitles.flatMap((section) => section.items);

  const getMoreMenu = (title: string) => (
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

  return (
    <div className="flex h-[800px] w-[260px] flex-col border-r border-border bg-muted-background">
      <NavigationList className="h-full w-[260px]">
        <NavigationListCollapsibleSection
          label="Inbox"
          className="border-b border-t border-border bg-background/50 px-2 pb-2"
          action={
            <>
              {/* <div className="heading-xs h-5 cursor-pointer px-2 text-muted-foreground hover:text-foreground">
                Mark as read
              </div> */}
              <Button
                size="xmini"
                icon={CheckDouble}
                variant="ghost"
                aria-label="Add new item"
                tooltip="Mark all as read"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Add action logic here
                }}
              />
            </>
          }
        >
          {getRandomTitles(6).map((title, index) => {
            const statuses: NavigationListItemStatus[] = [
              "idle",
              "unread",
              "blocked",
              "error",
              "idle",
              "idle",
            ];
            const counts: Array<number | undefined> = [
              undefined,
              undefined,
              undefined,
              undefined,
              5,
              12,
            ];
            return (
              <NavigationListItem
                key={index}
                href={index % 2 === 0 ? "#" : undefined}
                selected={index === selectedIndex}
                status={statuses[index % 6]}
                count={counts[index % 6]}
                onClick={(e) => {
                  if (!e.defaultPrevented) {
                    e.preventDefault();
                    setSelectedIndex(index);
                  }
                }}
                label={title}
                className="w-full"
                moreMenu={getMoreMenu(title)}
              />
            );
          })}
        </NavigationListCollapsibleSection>
        <NavigationListCollapsibleSection
          label="Projects"
          type="collapse"
          defaultOpen={true}
          visibleItems={4}
          className="px-2 maw-w-full"
          action={
            <>
              <Button
                size="xmini"
                icon={Plus}
                variant="ghost"
                aria-label="Add new item"
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
            label="SeriesB"
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
                aria-label="Add new item"
                tooltip="New Conversation"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Add action logic here
                }}
              />
              <Button
                size="xmini"
                icon={DotsHorizontal}
                variant="ghost"
                aria-label="Add new item"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Add action logic here
                }}
              />
            </>
          }
        >
          {conversationTitles.map((section, sectionIndex) => (
            <>
              <NavigationListCompactLabel
                key={sectionIndex}
                label={section.label}
                isSticky
              />
              {section.items.map((title, index) => {
                const itemIndex = allItems.indexOf(title);
                return (
                  <NavigationListItem
                    key={index}
                    href={index % 2 === 0 ? "#" : undefined}
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
                    moreMenu={getMoreMenu(title)}
                  />
                );
              })}
            </>
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
                aria-label="Add new item"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Add action logic here
                }}
              />
              <Button
                size="xmini"
                icon={DotsHorizontal}
                variant="ghost"
                aria-label="Add new item"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Add action logic here
                }}
              />
            </>
          }
        >
          {[
            {
              handle: "alex",
              name: "Alex",
              emoji: "🤖",
              color: "bg-blue-300",
            },
            {
              handle: "sam",
              name: "Sam",
              emoji: "🎨",
              color: "bg-violet-300",
            },
            {
              handle: "taylor",
              name: "Taylor",
              emoji: "🚀",
              color: "bg-pink-300",
            },
            {
              handle: "jordan",
              name: "Jordan",
              emoji: "⚡",
              color: "bg-orange-300",
            },
            {
              handle: "riley",
              name: "Riley",
              emoji: "🌟",
              color: "bg-golden-300",
            },
            {
              handle: "casey",
              name: "Casey",
              emoji: "💡",
              color: "bg-emerald-300",
            },
          ].map((agent, index) => (
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

const fakeTitles = [
  "Project Kickoff Meeting",
  "Budget Review Discussion",
  "Weekly Sync with Team",
  "AI Bot Training Session",
  "Quarterly Planning Meeting",
  "Feedback on Latest Design",
  "Client Requirements Gathering",
  "Sprint Retrospective",
  "Daily Standup",
  "Marketing Strategy Planning",
  "Code Review Session",
  "Product Launch Preparation",
  "Onboarding New Team Members",
  "Customer Feedback Analysis",
  "Feature Prioritization Discussion",
  "Technical Debt Assessment",
  "Supply Chain Optimization",
  "Sales Performance Review",
  "Cross-Department Collaboration",
  "Innovation Brainstorming",
  "Risk Management Workshop",
  "Holiday Schedule Planning",
  "Compliance and Security Update",
  "UI/UX Design Critique",
  "End-of-Year Wrap Up",
  "Resource Allocation Meeting",
  "Vendor Negotiation Strategy",
  "Crisis Management Scenario",
  "SEO Best Practices Review",
  "New Hire Orientation",
  "Remote Work Policy Update",
  "Company Values Workshop",
  "Leadership Development Session",
  "Diversity and Inclusion Training",
  "Performance Improvement Plan",
  "Customer Success Story Sharing",
  "Community Engagement Strategy",
  "Internal Product Demo",
  "Cost Reduction Initiative",
  "Change Management Planning",
  "Employee Recognition Program",
  "IT Infrastructure Upgrade",
  "Content Marketing Planning",
  "Team Building Activities",
  "Data Privacy Compliance",
  "Board Meeting Preparation",
  "Investor Relations Update",
  "KPI Tracking and Reporting",
  "Industry Trends Analysis",
  "Partnership Opportunities Exploration",
  "Employee Wellness Program",
  "Talent Acquisition Strategy",
  "Brand Positioning Workshop",
  "Social Media Campaign Planning",
  "Competitive Analysis Review",
  "Legal Compliance Training",
  "Cybersecurity Awareness Session",
  "Cultural Exchange Program",
  "Product Roadmap Presentation",
  "Customer Journey Mapping",
  "Financial Forecasting Session",
  "Brand Storytelling Workshop",
  "AI Ethics and Governance Discussion",
  "Operational Efficiency Assessment",
  "Annual Report Drafting",
  "Project Milestone Celebration",
  "Quality Assurance Review",
  "Public Relations Strategy",
  "Team Performance Metrics",
  "Innovation Lab Tour",
  "Digital Transformation Roadmap",
  "Sustainability Initiatives Planning",
  "Internal Communications Strategy",
  "Customer Advisory Board Meeting",
  "Agile Methodology Training",
  "E-commerce Platform Update",
  "Risk Assessment and Mitigation",
  "Employee Satisfaction Survey Results",
  "Sales Funnel Optimization",
  "Cross-Cultural Communication Training",
  "Global Expansion Strategy",
  "Cloud Migration Plan",
  "Crisis Communication Strategy",
  "Webinar Content Creation",
  "Supply Chain Risk Management",
  "Data Analytics and Insights",
  "Customer Onboarding Process",
  "Brand Awareness Campaign",
  "Product Feature Request Review",
  "Annual Budget Allocation",
  "Employee Exit Interview",
  "User Feedback Session",
  "Strategic Partnership Negotiation",
  "Market Entry Strategy",
  "Employee Handbook Update",
  "Stakeholder Engagement Plan",
  "AI Chatbot Development",
  "Customer Retention Strategy",
  "Company Anniversary Celebration",
  "Leadership Team Offsite",
  "Innovation Challenge Kickoff",
  "Employee Benefits Review",
  "Business Continuity Planning",
];
