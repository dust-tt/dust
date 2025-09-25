import { DropdownMenuCheckboxItemProps } from "@radix-ui/react-dropdown-menu";
import type { Meta } from "@storybook/react";
import React from "react";
import { useState } from "react";

import { Spinner } from "@sparkle/components";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuStaticItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTagItem,
  DropdownMenuTagList,
  DropdownMenuTrigger,
} from "@sparkle/components/Dropdown";
import {
  AnthropicLogo,
  DriveLogo,
  GithubLogo,
  MistralLogo,
  NotionLogo,
  OpenaiLogo,
  SlackLogo,
} from "@sparkle/logo/platforms";

import {
  ActionArmchairIcon,
  ActionCloudArrowDownIcon,
  ActionCommand1Icon,
  ActionDocumentIcon,
  ActionFolderIcon,
  ActionMagicIcon,
  ActionUserGroupIcon,
  AlertTriangleIcon,
  ArrowDownCircleIcon,
  ArrowUpOnSquareIcon,
  AttachmentIcon,
  Avatar,
  Button,
  ChatBubbleBottomCenterPlusIcon,
  CloudArrowDownIcon,
  Cog6ToothIcon,
  DocumentIcon,
  DoubleIcon,
  FolderIcon,
  HandThumbDownIcon,
  HandThumbUpIcon,
  Icon,
  LogoutIcon,
  MagicIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  RobotIcon,
  SearchDropdownMenu,
  SuitcaseIcon,
  UserGroupIcon,
  UserIcon,
} from "../index_with_tw_base";
import { Chip } from "../index_with_tw_base";

const meta = {
  title: "Primitives/Dropdown",
  component: DropdownMenu,
} satisfies Meta<typeof DropdownMenu>;

export default meta;

export const DropdownExamples = () => (
  <div className="s-flex s-h-80 s-w-full s-flex-col s-items-center s-justify-center s-gap-4 s-text-foreground dark:s-text-foreground-night">
    <div>{SimpleDropdownDemo()}</div>
    <div>{ComplexDropdownDemo()}</div>
    <div>{DropdownMenuCheckboxes()}</div>
    <div>{DropdownMenuRadioGroupDemo()}</div>
    <div>{ModelsDropdownDemo()}</div>
    <div>{ModelsDropdownRadioGroupDemo()}</div>
    <div>{StaticItemDropdownDemo()}</div>
  </div>
);

export const PickerExamples = () => (
  <div className="s-flex s-h-80 s-w-full s-flex-col s-items-center s-justify-center s-gap-4 s-text-foreground dark:s-text-foreground-night">
    <div>{AttachFileDemo()}</div>
  </div>
);

export const SearchDropdownMenuExamples = () => {
  const [searchInputValue, setSearchInputValue] = React.useState("");

  const items = ["Profile", "Billing", "Team", "Subscription"];

  const filteredItems = items.filter((item) =>
    item.toLowerCase().includes(searchInputValue.toLowerCase())
  );

  return (
    <div className="s-flex s-h-80 s-w-full s-flex-col s-items-center s-justify-center s-gap-4 s-text-foreground dark:s-text-foreground-night">
      <div>
        <SearchDropdownMenu
          searchInputValue={searchInputValue}
          setSearchInputValue={setSearchInputValue}
        >
          {filteredItems.map((item) => (
            <DropdownMenuItem
              key={item}
              label={item}
              onClick={() => {
                console.log(item);
              }}
            />
          ))}
        </SearchDropdownMenu>
      </div>
    </div>
  );
};

function SimpleDropdownDemo() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Open Simple Dropdown</DropdownMenuTrigger>
      <DropdownMenuContent className="s-max-w-[300px]">
        <DropdownMenuLabel label="My Account" />
        <DropdownMenuItem
          icon={() => (
            <Avatar
              size="xs"
              visual="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
            />
          )}
          label="@hello"
          onClick={() => {
            console.log("hello");
          }}
          description="Anthropic's latest Claude 3.5 Sonnet model (200k context). Anthropic's latest Claude 3.5 Sonnet model (200k context). Anthropic's latest Claude 3.5 Sonnet model (200k context)."
        />
        <DropdownMenuItem
          truncateText
          icon={() => (
            <Avatar
              size="xs"
              visual="https://dust.tt/static/droidavatar/Droid_Pink_3.jpg"
            />
          )}
          label="@helloWorld"
          onClick={() => {
            console.log("hello");
          }}
          description="Anthropic's latest Claude 3.5 Sonnet model (200k context)."
        />
        <DropdownMenuItem label="Profile" />
        <DropdownMenuItem label="Billing" />
        <DropdownMenuItem label="Team" />
        <DropdownMenuItem label="Subscription" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ComplexDropdownDemo() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Open Complex</DropdownMenuTrigger>
      <DropdownMenuContent className="s-w-56">
        <DropdownMenuLabel label="My Account" />
        <DropdownMenuGroup>
          <DropdownMenuItem
            icon={UserIcon}
            label="Profile"
            endComponent={
              <Button size="mini" icon={ArrowUpOnSquareIcon} variant="ghost" />
            }
          />
          <DropdownMenuItem icon={ArrowDownCircleIcon} label="Billing" />
          <DropdownMenuItem icon={Cog6ToothIcon} label="Settings" />
          <DropdownMenuItem icon={UserIcon} label="Keyboard shortcuts" />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel label="Team" />
          <DropdownMenuItem icon={UserIcon} label="Members" />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger icon={UserIcon} label="Invite users" />
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem icon={MagicIcon} label="Email" />
                <DropdownMenuItem
                  icon={ChatBubbleBottomCenterPlusIcon}
                  label="Message"
                />
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={UserIcon} label="More..." />
                <DropdownMenuItem icon={UserIcon} label="More.." />
                <DropdownMenuItem icon={UserIcon} label="More..." />
                <DropdownMenuItem icon={UserIcon} label="More.." />
                <DropdownMenuItem icon={UserIcon} label="More" />
                <DropdownMenuItem icon={UserIcon} label="More....." />
                <DropdownMenuItem icon={UserIcon} label="More.." />
                <DropdownMenuItem icon={UserIcon} label="More" />
                <DropdownMenuItem icon={UserIcon} label="More...." />
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuItem icon={UserGroupIcon} label="New Team" />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={GithubLogo} label="GitHub" />
        <DropdownMenuItem icon={UserIcon} label="Support" />
        <DropdownMenuItem icon={CloudArrowDownIcon} label="API" disabled />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={LogoutIcon}
          label="Log out"
          variant="warning"
          href="/api/auth/logout"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Checked = DropdownMenuCheckboxItemProps["checked"];

function DropdownMenuCheckboxes() {
  const [showStatusBar, setShowStatusBar] = React.useState<Checked>(true);
  const [showActivityBar, setShowActivityBar] = React.useState<Checked>(false);
  const [showPanel, setShowPanel] = React.useState<Checked>(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Open Checkbox</DropdownMenuTrigger>
      <DropdownMenuContent className="s-w-72">
        <DropdownMenuLabel label="Interface Settings" />
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={showStatusBar}
          onCheckedChange={setShowStatusBar}
          label="Status Bar"
          description="Show application status and progress indicators"
          truncateText
        />
        <DropdownMenuCheckboxItem
          checked={showActivityBar}
          onCheckedChange={setShowActivityBar}
          label="Activity Bar"
          description="Display sidebar with quick access to tools"
          truncateText
          disabled
        />
        <DropdownMenuCheckboxItem
          checked={showPanel}
          onCheckedChange={setShowPanel}
          label="Panel"
          description="Bottom panel for terminal and debug output"
          truncateText
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DropdownMenuRadioGroupDemo() {
  const [position, setPosition] = React.useState("bottom");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Open Radio Group</DropdownMenuTrigger>
      <DropdownMenuContent className="s-w-56">
        <DropdownMenuLabel label="Panel Position" />
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={position} onValueChange={setPosition}>
          <DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="bottom">Bottom</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="right">Right</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModelsDropdownDemo() {
  const [selectedModel, setSelectedModel] = React.useState<string>("GPT4-o");
  const bestPerformingModels = [
    {
      name: "GPT4-o",
      description: "OpenAI's most advanced model.",
      icon: OpenaiLogo,
    },
    {
      name: "Claude 3.5 Sonnet",
      description: "Anthropic's latest Claude 3.5 Sonnet model (200k context).",
      icon: AnthropicLogo,
    },
    {
      name: "Mistral Large",
      description: "Mistral's `large 2` model (128k context).",
      icon: MistralLogo,
    },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label={selectedModel}
          variant="outline"
          size="sm"
          tooltip="Test"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel label="Best performing models" />
        {bestPerformingModels.map((modelConfig) => (
          <DropdownMenuItem
            key={modelConfig.name}
            label={modelConfig.name}
            onClick={() => setSelectedModel(modelConfig.name)}
            description={modelConfig.description}
            icon={modelConfig.icon}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ModelConfig {
  name: string;
  description: string;
  icon: React.ComponentType;
}

function ModelsDropdownRadioGroupDemo() {
  const [selectedModel, setSelectedModel] = React.useState<string>("GPT4-o");

  const bestPerformingModels: ModelConfig[] = [
    {
      name: "GPT4-o",
      description: "OpenAI's most advanced model.",
      icon: OpenaiLogo,
    },
    {
      name: "Claude 3.5 Sonnet",
      description: "Anthropic's latest Claude 3.5 Sonnet model (200k context).",
      icon: AnthropicLogo,
    },
    {
      name: "Mistral Large",
      description: "Mistral's `large 2` model (128k context).",
      icon: MistralLogo,
    },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button label={selectedModel} variant="ghost" size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup
          value={selectedModel}
          onValueChange={(value) => setSelectedModel(value)}
        >
          <DropdownMenuLabel label="Best performing models" />
          {bestPerformingModels.map((modelConfig) => (
            <DropdownMenuRadioItem
              key={modelConfig.name}
              label={modelConfig.name}
              icon={modelConfig.icon}
              description={modelConfig.description}
              value={modelConfig.name}
            />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AttachFileDemo() {
  const [searchText, setSearchText] = React.useState("");
  const [selectedItem, setSelectedItem] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [openAgents, setOpenAgents] = React.useState(false);
  const [openToolsets, setOpenToolsets] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const agentsSearchInputRef = React.useRef<HTMLInputElement>(null);
  const toolsetsSearchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
    }
  }, [open]);

  React.useEffect(() => {
    if (openAgents) {
      setTimeout(() => {
        agentsSearchInputRef.current?.focus();
      }, 0);
    }
  }, [openAgents]);

  React.useEffect(() => {
    if (openToolsets) {
      setTimeout(() => {
        toolsetsSearchInputRef.current?.focus();
      }, 0);
    }
  }, [openToolsets]);

  const items = [
    "Automated Data Processing Automated Data Processing Automated Data Processing Automated Data Processing",
    "Business Intelligence Dashboard",
    "Cloud Infrastructure Setup",
    "Data Migration Service",
    "Enterprise Resource Planning",
    "Financial Analytics Platform",
    "Geographic Information System",
    "Human Resources Management",
    "Inventory Control System",
    "Knowledge Base Integration",
    "Machine Learning Pipeline",
    "Network Security Monitor",
    "Operations Management Tool",
    "Project Portfolio Tracker",
    "Quality Assurance Framework",
    "Real-time Analytics Engine",
    "Supply Chain Optimizer",
    "Team Collaboration Hub",
    "User Authentication Service",
    "Workflow Automation System",
  ];

  const filteredItems = items.filter((item) =>
    item.toLowerCase().includes(searchText.toLowerCase())
  );

  const mainIcons = [FolderIcon, DocumentIcon];
  const extraIcons = [DriveLogo, NotionLogo, SlackLogo];

  const filteredAgents = [
    {
      name: "Research Assistant",
      description: "Academic research and paper analysis",
      emoji: "🔬",
      backgroundColor: "s-bg-blue-200",
    },
    {
      name: "Code Companion",
      description: "Pair programming and code review",
      emoji: "💻",
      backgroundColor: "s-bg-purple-200",
    },
    {
      name: "Data Analyst",
      description: "Data visualization and insights",
      emoji: "��",
      backgroundColor: "s-bg-green-200",
    },
    {
      name: "Content Writer",
      description: "Blog posts and marketing copy",
      emoji: "✍️",
      backgroundColor: "s-bg-yellow-200",
    },
    {
      name: "Customer Support",
      description: "24/7 customer service automation",
      emoji: "🤝",
      backgroundColor: "s-bg-pink-200",
    },
    {
      name: "Legal Assistant",
      description: "Contract review and legal research",
      emoji: "⚖️",
      backgroundColor: "s-bg-red-200",
    },
    {
      name: "Design Assistant",
      description: "UI/UX design and prototyping",
      emoji: "🎨",
      backgroundColor: "s-bg-indigo-200",
    },
    {
      name: "Financial Advisor",
      description: "Investment analysis and planning",
      emoji: "💰",
      backgroundColor: "s-bg-emerald-200",
    },
  ] as const;

  const filteredToolsetList = [
    {
      name: "Product Design Suite",
      description: "Figma, Adobe XD, and design assets",
      icon: ActionMagicIcon,
    },
    {
      name: "Business Intelligence",
      description: "Tableau, PowerBI, and analytics tools",
      icon: ActionDocumentIcon,
    },
    {
      name: "Project Management",
      description: "Notion, Jira, and task tracking",
      icon: ActionFolderIcon,
    },
    {
      name: "Communication Hub",
      description: "Slack, Email, and messaging platforms",
      icon: ActionArmchairIcon,
    },
    {
      name: "Development Stack",
      description: "GitHub, VSCode, and dev tools",
      icon: ActionCommand1Icon,
    },
    {
      name: "Customer Success",
      description: "Zendesk, Intercom, and support tools",
      icon: ActionUserGroupIcon,
    },
    {
      name: "Marketing Suite",
      description: "HubSpot, Mailchimp, and campaign tools",
      icon: ActionCloudArrowDownIcon,
    },
    {
      name: "Data Warehouse",
      description: "Snowflake, BigQuery, and data storage",
      icon: ActionArmchairIcon,
    },
    {
      name: "HR Platform",
      description: "BambooHR, Workday, and people tools",
      icon: ActionMagicIcon,
    },
    {
      name: "Finance Stack",
      description: "QuickBooks, Stripe, and payment tools",
      icon: ActionFolderIcon,
    },
  ] as const;

  return (
    <div className="s-flex s-gap-2">
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            label={selectedItem || "Attach"}
            icon={AttachmentIcon}
            variant="outline"
            size="sm"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="s-w-[380px]"
          dropdownHeaders={
            <DropdownMenuSearchbar
              value={searchText}
              onChange={setSearchText}
              name="search"
              placeholder="Search in Dust"
              button={<Button icon={ArrowUpOnSquareIcon} label="Upload File" />}
            />
          }
        >
          <DropdownMenuSeparator />
          {searchText ? (
            filteredItems.map((item) => {
              const randomMainIcon =
                mainIcons[Math.floor(Math.random() * mainIcons.length)];
              const randomExtraIcon =
                extraIcons[Math.floor(Math.random() * extraIcons.length)];
              return (
                <DropdownMenuItem
                  key={item}
                  label={item}
                  description="Company Space/Notion"
                  icon={
                    <DoubleIcon
                      size="lg"
                      mainIcon={randomMainIcon}
                      secondaryIcon={randomExtraIcon}
                    />
                  }
                  onClick={() => {
                    setSelectedItem(item);
                    setSearchText("");
                  }}
                  truncateText
                />
              );
            })
          ) : (
            <div className="s-flex s-h-full s-w-full s-items-center s-justify-center s-py-8">
              <div className="s-flex s-flex-col s-items-center s-justify-center s-gap-0 s-text-center s-text-base s-font-semibold s-text-primary-400">
                <Icon visual={MagnifyingGlassIcon} size="sm" />
                Search in Dust
              </div>
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu open={openAgents} onOpenChange={setOpenAgents}>
        <DropdownMenuTrigger asChild>
          <Button icon={RobotIcon} variant="outline" size="sm" isSelect />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="s-h-96 s-w-[380px]"
          dropdownHeaders={
            <DropdownMenuSearchbar
              ref={agentsSearchInputRef}
              name="search"
              value={searchText}
              onChange={setSearchText}
              onKeyDown={() => {}}
              placeholder="Search Agents"
              button={<Button icon={PlusIcon} label="Create" />}
            />
          }
        >
          <DropdownMenuSeparator />
          {filteredAgents.map((agent) => {
            return (
              <DropdownMenuItem
                key={agent.name}
                label={agent.name}
                description={agent.description}
                icon={() => (
                  <Avatar
                    size="sm"
                    emoji={agent.emoji}
                    backgroundColor={agent.backgroundColor}
                  />
                )}
                onClick={() => {
                  setSelectedItem(agent.name);
                  setSearchText("");
                }}
                truncateText
              />
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu open={openToolsets} onOpenChange={setOpenToolsets}>
        <DropdownMenuTrigger asChild>
          <Button
            label={selectedItem || "Add Toolset"}
            icon={SuitcaseIcon}
            variant="outline"
            size="sm"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="s-h-96 s-w-[380px]"
          dropdownHeaders={
            <DropdownMenuSearchbar
              ref={toolsetsSearchInputRef}
              name="search"
              value={searchText}
              onChange={setSearchText}
              onKeyDown={() => {}}
              placeholder="Search Tools"
              button={<Button icon={PlusIcon} label="Add MCP Server" />}
            />
          }
        >
          <DropdownMenuSeparator />
          {filteredToolsetList.map((toolset) => {
            return (
              <DropdownMenuItem
                key={toolset.name}
                label={toolset.name}
                description={toolset.description}
                icon={() => <Avatar size="sm" icon={toolset.icon} />}
                onClick={() => {
                  setSelectedItem(toolset.name);
                  setSearchText("");
                }}
                truncateText
              />
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function StaticItemDropdownDemo() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button label="System Status" variant="outline" size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="s-w-[250px]">
        <DropdownMenuLabel label="System Metrics" />
        <DropdownMenuStaticItem label="CPU Usage" value="45%" />
        <DropdownMenuStaticItem label="Memory" value="2.3GB/8GB" />
        <DropdownMenuStaticItem label="Disk Space">
          <span className="s-flex s-items-center s-gap-2 s-text-muted-foreground">
            3
            <Icon
              size="xs"
              className="s-text-muted-foreground"
              visual={HandThumbUpIcon}
            />
            1
            <Icon
              size="xs"
              className="s-text-muted-foreground"
              visual={HandThumbDownIcon}
            />
          </span>
        </DropdownMenuStaticItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel label="Actions" />
        <DropdownMenuItem
          icon={Cog6ToothIcon}
          label="System Settings"
          onClick={() => console.log("Settings clicked")}
        />
        <DropdownMenuItem
          icon={CloudArrowDownIcon}
          label="Download Report"
          onClick={() => console.log("Download clicked")}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const TagsDropdownExample = () => {
  const [tags, setTags] = useState([
    "react",
    "typescript",
    "ui",
    "design-system",
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleAddTag = () => {
    setIsLoading(true);

    // Simulate API call delay
    setTimeout(() => {
      const newTag = `tag-${Math.floor(Math.random() * 1000)}`;
      setTags([...tags, newTag]);
      setIsLoading(false);
    }, 1500);
  };

  return (
    <div className="s-flex s-flex-col s-gap-4 s-p-4">
      <div className="s-flex s-items-center s-gap-2">
        <DropdownMenu open={true}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              label="Select Tags"
              icon={PlusIcon}
              size="sm"
              isSelect
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="s-w-80">
            <DropdownMenuLabel label="Available Tags" />
            <DropdownMenuSeparator />
            <DropdownMenuTagList>
              {tags.map((tag) => (
                <DropdownMenuTagItem
                  key={tag}
                  label={tag}
                  color="highlight"
                  onRemove={() => handleRemoveTag(tag)}
                  onClick={() => console.log(tag)}
                />
              ))}
            </DropdownMenuTagList>

            <DropdownMenuSeparator />
            <div className="s-p-2">
              <Button
                label={isLoading ? "Adding..." : "Add Random Tag"}
                onClick={handleAddTag}
                className="s-w-full"
                size="sm"
                disabled={isLoading}
                icon={
                  isLoading
                    ? () => <Spinner size="xs" variant="color" />
                    : undefined
                }
              />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="s-text-sm s-text-muted-foreground">
          Click to view available tags
        </div>
      </div>

      <div className="s-flex s-flex-wrap s-gap-2 s-rounded-lg s-border s-border-border s-p-4">
        <span className="s-mr-2 s-text-sm s-text-muted-foreground">
          Current tags:
        </span>
        {tags.map((tag) => (
          <div key={tag} className="s-inline-flex">
            <Chip
              label={tag}
              color="highlight"
              size="xs"
              onRemove={() => handleRemoveTag(tag)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
