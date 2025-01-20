import { Meta } from "@storybook/react";
import React, { useEffect, useState } from "react";

import {
  Avatar,
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  ScrollArea,
  SearchInput,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tree,
} from "@sparkle/components";
import {
  ArrowUpOnSquareIcon,
  BookOpenIcon,
  BracesIcon,
  ChatBubbleBottomCenterTextIcon,
  ChatBubbleLeftRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  CloudArrowLeftRightIcon,
  Cog6ToothIcon,
  CompanyIcon,
  FolderIcon,
  GlobeAltIcon,
  HandThumbUpIcon,
  HeartAltIcon,
  LockIcon,
  LogoutIcon,
  MoreIcon,
  PencilSquareIcon,
  PlusIcon,
  PuzzleIcon,
  RobotIcon,
  ServerIcon,
  ShapesIcon,
  TrashIcon,
  UserIcon,
} from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";
import { NotionLogo, SlackLogo } from "@sparkle/logo";

const meta = {
  title: "NewLayouts/AppLayout",
} satisfies Meta;

export default meta;

const getRandomTitles = (count: number) => {
  const shuffled = fakeTitles.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

export const LayoutDemo = () => {
  const [computedSize, setComputedSize] = useState(0);
  const [isNavVisible, setIsNavVisible] = useState(false);
  const [isFixed, setIsFixed] = useState(true);

  const updateComputedSize = () => {
    const mainDiv = document.getElementById("NavigationPrimary");
    const bottomBar = document.getElementById("NavigationSecondary");

    if (mainDiv && bottomBar) {
      const offset = bottomBar.offsetHeight;
      const newSize = mainDiv.offsetHeight - offset;
      setComputedSize(newSize);
    }
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const { clientX } = event;

    if (!isFixed && clientX < 50) {
      setIsNavVisible(true);
    }
  };

  const handleMouseLeave = () => {
    if (!isFixed) {
      setIsNavVisible(false);
    }
  };

  useEffect(() => {
    updateComputedSize();
    window.addEventListener("resize", updateComputedSize);
    return () => {
      window.removeEventListener("resize", updateComputedSize);
    };
  }, []);

  useEffect(() => {
    updateComputedSize();
  }, [isFixed]);

  const navigationPanel = (
    <div
      id="NavigationPrimary"
      className="s-flex s-h-full s-w-full s-flex-col s-bg-structure-50"
      onMouseLeave={handleMouseLeave}
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
        <TabsContent value="knowledge" className="s-h-full s-w-full">
          <KnowledgeNav />
        </TabsContent>
        <TabsContent value="settings" className="s-h-full s-w-full">
          <SettingTab />
        </TabsContent>
      </Tabs>
      <BottomNav
        id="NavigationSecondary"
        className="s-h-14 s-w-full"
        onHideNavigation={() => {
          setIsFixed(false);
          setIsNavVisible(false);
        }}
        isFixed={isFixed}
        onPinNavigation={() => {
          setIsFixed(true);
          setIsNavVisible(true);
        }}
      />
    </div>
  );

  return (
    <div
      className="s-h-[96vh] s-w-[98vw] s-overflow-hidden s-border"
      onMouseMove={handleMouseMove}
    >
      {!isFixed && (
        <div
          id="floatingNav"
          className={cn(
            "s-l-0 s-t-0 transition-transform s-absolute s-h-[100vh] s-w-[320px] s-p-3",
            "s-transform s-transition-transform s-duration-300",
            isNavVisible ? "s-transform-none" : "s--translate-x-full"
          )}
        >
          <div className="s-rounded-lg s-border s-border-border s-shadow-sm">
            {navigationPanel}
          </div>
        </div>
      )}

      <ResizablePanelGroup direction="horizontal" className="s-h-full s-w-full">
        {isFixed && (
          <ResizablePanel
            order={1}
            id="fixedNav"
            defaultSize={22}
            maxSize={32}
            minSize={20}
          >
            {navigationPanel}
          </ResizablePanel>
        )}
        <ResizableHandle />
        <ResizablePanel order={2}>
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
      <div className="s-my-2 s-flex s-w-full s-justify-end s-gap-2 s-px-2">
        <SearchInput name="input" value="" />
        <Button
          icon={ChatBubbleBottomCenterTextIcon}
          label="New"
          tooltip="New conversation"
        />
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button
              variant="outline"
              tooltip="Manage conversation history, assistants..."
              icon={MoreIcon}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel label="Assistants" />
            <DropdownMenuItem icon={PlusIcon} label="New" />
            <DropdownMenuItem icon={RobotIcon} label="Manage" />
            <DropdownMenuSeparator />
            <DropdownMenuLabel label="Conversations" />
            <DropdownMenuItem icon={PencilSquareIcon} label="Edit" />
            <DropdownMenuItem icon={TrashIcon} label="Remove all" />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <NavigationList className="s-w-full s-px-2">
        {conversationTitles.map((section, sectionIndex) => (
          <React.Fragment key={sectionIndex}>
            <NavigationListLabel label={section.label} />
            {section.items.map((title, index) => {
              const itemIndex = allItems.indexOf(title);
              return (
                <ContextMenu>
                  <ContextMenuTrigger>
                    <NavigationListItem
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
      </NavigationList>
    </ScrollArea>
  );
};

interface BottomNavProps {
  id?: string;
  className?: string;
  onHideNavigation: () => void;
  isFixed: boolean;
  onPinNavigation: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  className = "",
  id,
  onHideNavigation,
  isFixed,
  onPinNavigation,
}) => {
  return (
    <div
      id={id}
      className={cn(
        "s-flex s-flex-row s-items-center s-gap-2 s-border-t s-border-structure-200 s-bg-white s-p-2",
        className
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Avatar
            size="sm"
            isRounded
            onClick={() => {}}
            name="Omar Doe"
            visual="https://cdn.midjourney.com/6f6bd6a2-668e-45ce-ad84-1b74138d751a/0_1.png"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem icon={UserIcon} label="User Settings" />
          <DropdownMenuItem icon={LogoutIcon} label="Log out" />
        </DropdownMenuContent>
      </DropdownMenu>
      <Separator orientation="vertical" />
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button
            variant={"ghost"}
            size="sm"
            label="Help"
            icon={HeartAltIcon}
            tooltip="Help, guides and documentation"
            isSelect
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem icon={RobotIcon} label="Talk to @Helper" />
          <DropdownMenuItem icon={BookOpenIcon} label="Guides" />
          <DropdownMenuItem icon={HandThumbUpIcon} label="Help Center" />
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="s-grow" />
      {isFixed ? (
        <Button
          variant={"ghost"}
          size="sm"
          icon={ChevronDoubleLeftIcon}
          tooltip="Hide the navigation panel"
          onClick={onHideNavigation}
        />
      ) : (
        <Button
          variant={"ghost"}
          size="sm"
          icon={ChevronDoubleRightIcon}
          tooltip="Pin the navigation panel"
          onClick={onPinNavigation}
        />
      )}
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

interface NavTabProps {
  className?: string;
}

export const KnowledgeNav: React.FC<NavTabProps> = ({ className = "" }) => {
  return (
    <div className={cn("s-flex s-flex-col s-gap-1 s-px-2 s-py-2", className)}>
      <Tree variant="navigator">
        <Tree.Item
          label="Connection Managment"
          visual={CloudArrowLeftRightIcon}
          onItemClick={() => console.log("Clickable")}
          isSelected={true}
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
      <NavigationListLabel variant="secondary" label="Workspace" />
      <Tree variant="navigator">
        <Tree.Item
          label="Drive"
          visual={ServerIcon}
          onItemClick={() => console.log("Clickable")}
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
            <Tree.Item label="Folders" visual={FolderIcon}>
              <Tree variant="navigator">
                <Tree.Item label="item 1" visual={FolderIcon} />
                <Tree.Item label="item 2" visual={FolderIcon} />
                <Tree.Item label="item 3" visual={FolderIcon} />
              </Tree>
            </Tree.Item>
            <Tree.Item label="Websites" visual={GlobeAltIcon}>
              <Tree variant="navigator">
                <Tree.Item label="item 1" visual={FolderIcon} />
                <Tree.Item label="item 2" visual={FolderIcon} />
                <Tree.Item label="item 3" visual={FolderIcon} />
              </Tree>
            </Tree.Item>
          </Tree>
        </Tree.Item>
      </Tree>
      <NavigationListLabel variant="secondary" label="Vaults" />
      <Tree variant="navigator">
        <Tree.Item
          label="Finance"
          visual={LockIcon}
          onItemClick={() => console.log("Clickable")}
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
        <Tree.Item
          label="HR"
          visual={LockIcon}
          onItemClick={() => console.log("Clickable")}
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
        <Tree.Item
          label="SeriesA"
          visual={LockIcon}
          onItemClick={() => console.log("Clickable")}
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

export const SettingTab = () => {
  return (
    <NavigationList className="s-w-full s-px-2">
      <NavigationListLabel label="Workspace" />
      <NavigationListItem label="Members" icon={UserIcon} selected />
      <NavigationListItem label="Workspace" icon={CompanyIcon} />
      <NavigationListItem label="Subscription" icon={ShapesIcon} />
      <NavigationListLabel label="Developers" />
      <NavigationListItem label="Providers" icon={PuzzleIcon} />
      <NavigationListItem label="API Keys" icon={LockIcon} />
      <NavigationListItem label="Secrets" icon={BracesIcon} />
    </NavigationList>
  );
};
