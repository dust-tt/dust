import { Meta } from "@storybook/react";
import React, { useEffect, useState } from "react";

import { ScrollBar } from "@sparkle/components/ScrollArea";
import {
  ArrowUpOnSquareIcon,
  Avatar,
  BookOpenIcon,
  ChatBubbleBottomCenterTextIcon,
  ChatBubbleLeftRightIcon,
  ChevronDoubleLeftIcon,
  Cog6ToothIcon,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  HandThumbUpIcon,
  HeartAltIcon,
  LogoutIcon,
  MoreIcon,
  NewButton,
  NewButtonBar,
  NewDropdownMenu,
  NewDropdownMenuContent,
  NewDropdownMenuItem,
  NewDropdownMenuLabel,
  NewDropdownMenuSeparator,
  NewDropdownMenuTrigger,
  NewNavigationList,
  NewNavigationListItem,
  NewNavigationListLabel,
  PencilSquareIcon,
  PlusIcon,
  RobotIcon,
  ScrollArea,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TrashIcon,
  UserIcon,
} from "@sparkle/index_with_tw_base";

const meta = {
  title: "NewLayouts/MainLayout",
} satisfies Meta;

export default meta;

const getRandomTitles = (count: number) => {
  const shuffled = fakeTitles.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

export const LayoutDemo = () => {
  return (
    <div className="s-flex s-h-[800px] s-w-full s-flex-row s-border">
      <div className="s-relative s-flex s-h-full s-w-[320px] s-flex-col s-border-r s-border-structure-200 s-bg-primary-50">
        <Tabs defaultValue="account" className="s-h-full">
          <TabsList className="s-mt-2 s-w-full s-px-2">
            <TabsTrigger
              value="account"
              label="Chat"
              icon={ChatBubbleLeftRightIcon}
            />
            <TabsTrigger
              value="password"
              label="Knowledge"
              icon={BookOpenIcon}
            />
            <div className="s-grow" />
            <TabsTrigger value="settings" icon={Cog6ToothIcon} />
          </TabsList>
          <TabsContent value="account" className="s-h-full">
            <ChatTab />
          </TabsContent>
          <TabsContent value="password"></TabsContent>
          <TabsContent value="settings">Settings</TabsContent>
        </Tabs>
        <BottomNav />
      </div>
    </div>
  );
};

export const ChatTab = () => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [conversationTitles, setConversationTitles] = useState<
    { label: string; items: string[] }[]
  >([]);

  useEffect(() => {
    // Generate random titles for each date section only once
    setConversationTitles([
      { label: "Today", items: getRandomTitles(5) },
      { label: "Yesterday", items: getRandomTitles(10) },
      { label: "Last Week", items: getRandomTitles(20) },
      { label: "Last Month", items: getRandomTitles(40) },
    ]);
  }, []);

  // Flatten the items array to easily manage indices
  const allItems = conversationTitles.flatMap((section) => section.items);

  return (
    <div className="s-relative s-h-[697px] s-w-full">
      <ScrollArea className="s-h-full s-w-full">
        <NewButtonBar className="s-my-2 s-w-full s-justify-end s-px-2">
          <NewDropdownMenu>
            <NewDropdownMenuTrigger>
              <NewButton
                variant="outline"
                tooltip="Manage conversation history, assistants..."
                icon={MoreIcon}
              />
            </NewDropdownMenuTrigger>
            <NewDropdownMenuContent>
              <NewDropdownMenuLabel label="Assistants" />
              <NewDropdownMenuItem icon={PlusIcon} label="New" />
              <NewDropdownMenuItem icon={RobotIcon} label="Manage" />
              <NewDropdownMenuSeparator />
              <NewDropdownMenuLabel label="Conversations" />
              <NewDropdownMenuItem icon={PencilSquareIcon} label="Edit" />
              <NewDropdownMenuItem icon={TrashIcon} label="Remove all" />
            </NewDropdownMenuContent>
          </NewDropdownMenu>
          <NewButton
            icon={ChatBubbleBottomCenterTextIcon}
            label="New"
            tooltip="New conversation"
          />
        </NewButtonBar>
        <NewNavigationList>
          {conversationTitles.map((section, sectionIndex) => (
            <React.Fragment key={sectionIndex}>
              <NewNavigationListLabel>{section.label}</NewNavigationListLabel>
              {section.items.map((title, index) => {
                const itemIndex = allItems.indexOf(title);
                return (
                  <ContextMenu>
                    <ContextMenuTrigger>
                      <NewNavigationListItem
                        key={index}
                        selected={itemIndex === selectedIndex}
                        onClick={() => setSelectedIndex(itemIndex)}
                      >
                        {title}
                      </NewNavigationListItem>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem label="Delete" icon={TrashIcon} />
                      <ContextMenuItem
                        label="Share"
                        icon={ArrowUpOnSquareIcon}
                      />
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </React.Fragment>
          ))}
        </NewNavigationList>
        <ScrollBar orientation="vertical" />
      </ScrollArea>
    </div>
  );
};

export const BottomNav = () => {
  return (
    <div className="s-flex s-flex-row s-items-center s-gap-2 s-border-t s-border-structure-200 s-bg-white s-p-2">
      <NewDropdownMenu>
        <NewDropdownMenuTrigger>
          <Avatar
            size="sm"
            isRounded
            onClick={() => {}}
            name="Omar Doe"
            visual="https://cdn.midjourney.com/6f6bd6a2-668e-45ce-ad84-1b74138d751a/0_1.png"
          />
        </NewDropdownMenuTrigger>
        <NewDropdownMenuContent>
          <NewDropdownMenuItem icon={UserIcon} label="User Settings" />
          <NewDropdownMenuItem icon={LogoutIcon} label="Log out" />
        </NewDropdownMenuContent>
      </NewDropdownMenu>

      <Separator orientation="vertical" />
      <NewDropdownMenu>
        <NewDropdownMenuTrigger>
          <NewButton
            variant={"ghost"}
            size="sm"
            label="Help"
            icon={HeartAltIcon}
            tooltip="Help, guides and documentation"
            isSelect
          />
        </NewDropdownMenuTrigger>
        <NewDropdownMenuContent>
          <NewDropdownMenuItem icon={RobotIcon} label="Talk to @Helper" />
          <NewDropdownMenuItem icon={BookOpenIcon} label="Guides" />
          <NewDropdownMenuItem icon={HandThumbUpIcon} label="Help Center" />
        </NewDropdownMenuContent>
      </NewDropdownMenu>
      <div className="s-grow" />
      <NewButton
        variant={"ghost-secondary"}
        size="sm"
        icon={ChevronDoubleLeftIcon}
        tooltip="Hide the navigation panel"
      />
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
