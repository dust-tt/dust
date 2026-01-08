import type { Meta } from "@storybook/react";
import React, { useEffect, useState } from "react";

import { ActionInboxIcon } from "@sparkle/icons/actions";
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
  PencilSquareIcon,
  TrashIcon,
  MoreIcon,
  InboxIcon,
  CollapsibleContent,
  Collapsible,
  CollapsibleTrigger,
  PlusIcon,
  NavigationListCompactLabel,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  SpaceOpenIcon,
  SpaceClosedIcon,
  CheckDoubleIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Modules/NavigationList",
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
          icon={PencilSquareIcon}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Add rename logic here
          }}
        />
        <DropdownMenuItem
          label="Delete"
          icon={TrashIcon}
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
    <div className="s-flex s-h-[400px] s-w-full s-flex-row s-gap-12">
      <div className="s-h-[400px] s-w-[240px]">
        <NavigationList className="s-relative s-h-full s-w-full s-px-3 dark:s-bg-muted-background-night">
          {conversationTitles.map((section, sectionIndex) => (
            <React.Fragment key={sectionIndex}>
              <NavigationListLabel label={section.label} />
              {section.items.map((title, index) => {
                const itemIndex = allItems.indexOf(title);
                // Add status based on index for demonstration
                const getStatus = (idx: number) => {
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
                    className="s-w-full"
                    moreMenu={getMoreMenu(title)}
                    status={getStatus(index)}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </NavigationList>
      </div>
      <div className="s-h-[400px] s-w-[240px]">
        <NavigationList className="s-relative s-h-full s-w-full s-px-3 dark:s-bg-muted-background-night">
          {conversationTitles.map((section, sectionIndex) => (
            <React.Fragment key={sectionIndex}>
              <NavigationListLabel label={section.label} isSticky />
              {section.items.map((title, index) => {
                const itemIndex = allItems.indexOf(title);
                // Add status based on index for demonstration.
                const getStatus = (idx: number) => {
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
                    className="s-w-full"
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
          icon={PencilSquareIcon}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
        <DropdownMenuItem
          label="Delete"
          icon={TrashIcon}
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
    <div className="s-dark:bg-muted-background-night s-flex s-h-[800px] s-w-[240px] s-flex-col s-border-r s-border-border s-bg-muted-background">
      <NavigationList className="s-relative s-h-full s-w-full s-py-2 dark:s-bg-muted-background-night">
        <NavigationListCollapsibleSection
          label="Inbox"
          className="s-border-b s-border-t s-border-border s-bg-background s-px-2 s-pb-2 dark:s-bg-background-night"
          actionOnHover={false}
          action={
            <>
              {/* <div className="s-heading-xs s-h-5 s-cursor-pointer s-px-2 s-text-muted-foreground hover:s-text-foreground">
                Mark as read
              </div> */}
              <Button
                size="xmini"
                icon={CheckDoubleIcon}
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
            const statuses: Array<
              "idle" | "unread" | "blocked" | "error" | number
            > = ["idle", "unread", "blocked", "error", 5, 12];
            return (
              <NavigationListItem
                key={index}
                href={index % 2 === 0 ? "#" : undefined}
                selected={index === selectedIndex}
                status={statuses[index % 6]}
                onClick={(e) => {
                  if (!e.defaultPrevented) {
                    e.preventDefault();
                    setSelectedIndex(index);
                  }
                }}
                label={title}
                className="s-w-full"
                moreMenu={getMoreMenu(title)}
              />
            );
          })}
        </NavigationListCollapsibleSection>
        <div className="s-px-2">
          <NavigationListCollapsibleSection
            label="Projects (empty)"
            type="collapse"
            defaultOpen={true}
            action={
              <>
                <Button
                  size="xmini"
                  icon={PlusIcon}
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
                  icon={MoreIcon}
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
            <NavigationListItem
              icon={PlusIcon}
              label="Create Project"
              href="#"
              onClick={(e) => {
                e.preventDefault();
              }}
            />
          </NavigationListCollapsibleSection>
          <NavigationListCollapsibleSection
            label="Projects"
            type="collapse"
            defaultOpen={true}
            action={
              <>
                <Button
                  size="xmini"
                  icon={PlusIcon}
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
                  icon={MoreIcon}
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
            <NavigationListItem
              icon={SpaceOpenIcon}
              label="Company"
              href="#"
              status={3}
              onClick={(e) => {
                e.preventDefault();
              }}
            />
            <NavigationListItem
              icon={SpaceOpenIcon}
              label="Design"
              status={8}
              href="#"
              onClick={(e) => {
                e.preventDefault();
              }}
            />
            <NavigationListItem
              icon={SpaceClosedIcon}
              label="SeriesB"
              href="#"
              onClick={(e) => {
                e.preventDefault();
              }}
            />
          </NavigationListCollapsibleSection>
          <NavigationListCollapsibleSection
            label="Conversations"
            type="collapse"
            defaultOpen={true}
            action={
              <>
                <Button
                  size="xmini"
                  icon={ChatBubbleLeftRightIcon}
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
                  icon={MoreIcon}
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
                />
                {section.items.map((title, index) => {
                  const itemIndex = allItems.indexOf(title);
                  return (
                    <NavigationListItem
                      key={index}
                      href={index % 2 === 0 ? "#" : undefined}
                      selected={itemIndex === selectedIndex}
                      onClick={(e) => {
                        if (!e.defaultPrevented) {
                          e.preventDefault();
                          setSelectedIndex(itemIndex);
                        }
                      }}
                      label={title}
                      className="s-w-full"
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
                  icon={PlusIcon}
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
                  icon={MoreIcon}
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
                color: "s-bg-blue-300",
              },
              {
                handle: "sam",
                name: "Sam",
                emoji: "🎨",
                color: "s-bg-violet-300",
              },
              {
                handle: "taylor",
                name: "Taylor",
                emoji: "🚀",
                color: "s-bg-pink-300",
              },
              {
                handle: "jordan",
                name: "Jordan",
                emoji: "⚡",
                color: "s-bg-orange-300",
              },
              {
                handle: "riley",
                name: "Riley",
                emoji: "🌟",
                color: "s-bg-golden-300",
              },
              {
                handle: "casey",
                name: "Casey",
                emoji: "💡",
                color: "s-bg-emerald-300",
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
                className="s-w-full"
              />
            ))}
          </NavigationListCollapsibleSection>
        </div>
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
