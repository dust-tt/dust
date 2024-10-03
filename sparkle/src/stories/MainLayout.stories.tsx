import { Meta } from "@storybook/react";
import React, { useEffect, useState } from "react";

import {
  ArrowUpOnSquareIcon,
  Avatar,
  BookOpenIcon,
  ChatBubbleBottomCenterTextIcon,
  ChatBubbleLeftRightIcon,
  ChevronDoubleLeftIcon,
  CloudArrowLeftRightIcon,
  Cog6ToothIcon,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  FolderIcon,
  HandThumbUpIcon,
  HeartAltIcon,
  HomeIcon,
  LockIcon,
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
  NewSearchInput,
  NotionLogo,
  PencilSquareIcon,
  PlusIcon,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  RobotIcon,
  ScrollArea,
  Separator,
  SlackLogo,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TrashIcon,
  Tree,
  UserIcon,
} from "@sparkle/index_with_tw_base";
import { cn } from "@sparkle/lib/utils";

const meta = {
  title: "NewLayouts/MainLayout",
} satisfies Meta;

export default meta;

const getRandomTitles = (count: number) => {
  const shuffled = fakeTitles.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

export const LayoutDemo = () => {
  const [computedSize, setComputedSize] = useState(0);

  const updateComputedSize = () => {
    const mainDiv = document.getElementById("NavigationPrimary");
    const bottomBar = document.getElementById("NavigationSecondary");

    if (mainDiv && bottomBar) {
      const offset = bottomBar.offsetHeight; // Get the height of the bottombar
      const newSize = mainDiv.offsetHeight - offset; // Subtract the offset
      setComputedSize(newSize);
    }
  };

  useEffect(() => {
    updateComputedSize();
    window.addEventListener("resize", updateComputedSize);
    return () => {
      window.removeEventListener("resize", updateComputedSize);
    };
  }, []);
  return (
    <div className="s-h-[98vh] s-w-[98vw] s-border">
      <ResizablePanelGroup direction="horizontal" className="s-h-full s-w-full">
        <ResizablePanel defaultSize={30} maxSize={32} minSize={20}>
          <div
            id="NavigationPrimary"
            className="s-flex s-h-full s-w-full s-flex-col s-bg-structure-50"
          >
            <Tabs
              defaultValue="conversations"
              className="s-flex s-w-full s-flex-col"
              style={{ height: `${computedSize}px` }}
            >
              <TabsList className="s-mt-2 s-w-full s-px-2">
                <TabsTrigger
                  value="conversations"
                  label="Chat"
                  icon={ChatBubbleLeftRightIcon}
                />
                <TabsTrigger
                  value="knowledge"
                  label="Knowledge"
                  icon={BookOpenIcon}
                />
                <div className="s-grow" />
                <TabsTrigger value="settings" icon={Cog6ToothIcon} />
              </TabsList>
              <TabsContent value="conversations" className="s-h-full s-w-full">
                <ChatTab />
              </TabsContent>
              <TabsContent value="Knowledge" className="s-h-full s-w-full">
                <KnowledgeNav />
              </TabsContent>
              <TabsContent value="settings" className="s-h-full s-w-full">
                Settings
              </TabsContent>
            </Tabs>
            <BottomNav id="NavigationSecondary" className="s-h-14 s-w-full" />
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={70}>
          <div className="s-flex s-h-full s-items-center s-justify-center s-p-6">
            <span className="s-font-semibold">Content</span>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
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
    <ScrollArea className="s-border-box s-h-full s-w-full">
      <NewButtonBar className="s-my-2 s-w-full s-justify-end s-px-2">
        <NewSearchInput name="input" value="" />
        <NewButton
          icon={ChatBubbleBottomCenterTextIcon}
          label="New"
          tooltip="New conversation"
        />
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
      </NewButtonBar>
      <NewNavigationList className="s-w-full">
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
                      label={title}
                    />
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem label="Delete" icon={TrashIcon} />
                    <ContextMenuItem label="Share" icon={ArrowUpOnSquareIcon} />
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </React.Fragment>
        ))}
      </NewNavigationList>
    </ScrollArea>
  );
};
interface BottomNavProps {
  id?: string; // Optional prop for additional classes
  className?: string; // Optional prop for additional classes
}

export const BottomNav: React.FC<BottomNavProps> = ({ className = "", id }) => {
  return (
    <div
      id={id}
      className={cn(
        "s-flex s-flex-row s-items-center s-gap-2 s-border-t s-border-structure-200 s-bg-white s-p-2",
        className
      )}
    >
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

interface BottomNavProps {
  className?: string; // Optional prop for additional classes
}

export const KnowledgeNav: React.FC<BottomNavProps> = ({ className = "" }) => {
  return (
    <div className={cn("s-flex s-flex-col s-gap-2 s-px-2", className)}>
      <Tree variant="navigator">
        <Tree.Item
          label="Connection Managment"
          visual={CloudArrowLeftRightIcon}
          onItemClick={() => console.log("Clickable")}
          isSelected={true}
          size="md"
        >
          <Tree variant="navigator">
            <Tree.Item label="Notion" visual={NotionLogo}>
              <Tree variant="navigator">
                <Tree.Item
                  label="item 1 with a very very very very very very very long text"
                  visual={FolderIcon}
                >
                  <Tree variant="navigator">
                    <Tree.Item
                      label="item 1 with a very very very very very very very long text"
                      visual={FolderIcon}
                      type="leaf"
                    />
                    <Tree.Item label="item 2" visual={FolderIcon} />
                    <Tree.Item label="item 3" visual={FolderIcon} />
                  </Tree>
                </Tree.Item>
                <Tree.Item label="item 2" visual={FolderIcon}>
                  <Tree variant="navigator">
                    <Tree.Item label="item 1" visual={FolderIcon} />
                    <Tree.Item label="item 2" visual={FolderIcon} />
                    <Tree.Item label="item 3" visual={FolderIcon} />
                  </Tree>
                </Tree.Item>
                <Tree.Item label="item 3" visual={FolderIcon}>
                  <Tree variant="navigator">
                    <Tree.Item label="item 1" visual={FolderIcon} />
                    <Tree.Item label="item 2" visual={FolderIcon} />
                    <Tree.Item label="item 3" visual={FolderIcon} />
                  </Tree>
                </Tree.Item>
              </Tree>
            </Tree.Item>
            <Tree.Item label="Slack" visual={SlackLogo} />
          </Tree>
        </Tree.Item>
      </Tree>
      <Tree variant="navigator">
        <Tree.Item
          label="Share Data"
          visual={HomeIcon}
          onItemClick={() => console.log("Clickable")}
          size="md"
        >
          <Tree variant="navigator">
            <Tree.Item label="Notion" visual={NotionLogo}>
              <Tree variant="navigator">
                <Tree.Item
                  label="item 1 with a very very very very very very very long text"
                  visual={FolderIcon}
                >
                  <Tree variant="navigator">
                    <Tree.Item
                      label="item 1 with a very very very very very very very long text"
                      visual={FolderIcon}
                      type="leaf"
                    />
                    <Tree.Item label="item 2" visual={FolderIcon} />
                    <Tree.Item label="item 3" visual={FolderIcon} />
                  </Tree>
                </Tree.Item>
                <Tree.Item label="item 2" visual={FolderIcon}>
                  <Tree variant="navigator">
                    <Tree.Item label="item 1" visual={FolderIcon} />
                    <Tree.Item label="item 2" visual={FolderIcon} />
                    <Tree.Item label="item 3" visual={FolderIcon} />
                  </Tree>
                </Tree.Item>
                <Tree.Item label="item 3" visual={FolderIcon}>
                  <Tree variant="navigator">
                    <Tree.Item label="item 1" visual={FolderIcon} />
                    <Tree.Item label="item 2" visual={FolderIcon} />
                    <Tree.Item label="item 3" visual={FolderIcon} />
                  </Tree>
                </Tree.Item>
              </Tree>
            </Tree.Item>
            <Tree.Item label="Slack" visual={SlackLogo} />
          </Tree>
        </Tree.Item>
      </Tree>
      <Tree variant="navigator">
        <Tree.Item
          label="Finance"
          visual={LockIcon}
          onItemClick={() => console.log("Clickable")}
          size="md"
        >
          <Tree variant="navigator">
            <Tree.Item label="Notion" visual={NotionLogo}>
              <Tree variant="navigator">
                <Tree.Item
                  label="item 1 with a very very very very very very very long text"
                  visual={FolderIcon}
                >
                  <Tree variant="navigator">
                    <Tree.Item
                      label="item 1 with a very very very very very very very long text"
                      visual={FolderIcon}
                      type="leaf"
                    />
                    <Tree.Item label="item 2" visual={FolderIcon} />
                    <Tree.Item label="item 3" visual={FolderIcon} />
                  </Tree>
                </Tree.Item>
                <Tree.Item label="item 2" visual={FolderIcon}>
                  <Tree variant="navigator">
                    <Tree.Item label="item 1" visual={FolderIcon} />
                    <Tree.Item label="item 2" visual={FolderIcon} />
                    <Tree.Item label="item 3" visual={FolderIcon} />
                  </Tree>
                </Tree.Item>
                <Tree.Item label="item 3" visual={FolderIcon}>
                  <Tree variant="navigator">
                    <Tree.Item label="item 1" visual={FolderIcon} />
                    <Tree.Item label="item 2" visual={FolderIcon} />
                    <Tree.Item label="item 3" visual={FolderIcon} />
                  </Tree>
                </Tree.Item>
              </Tree>
            </Tree.Item>
            <Tree.Item label="Slack" visual={SlackLogo} />
          </Tree>
        </Tree.Item>
      </Tree>
    </div>
  );
};
