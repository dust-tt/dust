import { DropdownMenuCheckboxItemProps } from "@radix-ui/react-dropdown-menu";
import type { Meta } from "@storybook/react";
import React from "react";

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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@sparkle/components/Dropdown";
import {
  AnthropicLogo,
  GithubLogo,
  MistralLogo,
  OpenaiLogo,
} from "@sparkle/logo/platforms";

import {
  ArrowDownCircleIcon,
  Avatar,
  Button,
  ChatBubbleBottomCenterPlusIcon,
  CloudArrowDownIcon,
  Cog6ToothIcon,
  LogoutIcon,
  MagicIcon,
  ScrollArea,
  UserGroupIcon,
  UserIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Primitives/Dropdown",
  component: DropdownMenu,
} satisfies Meta<typeof DropdownMenu>;

export default meta;

export const DropdownExamples = () => (
  <div className="s-flex s-h-80 s-w-full s-flex-col s-items-center s-justify-center s-gap-4">
    <div>{SimpleDropdownDemo()}</div>
    <div>{ComplexDropdownDemo()}</div>
    <div>{DropdownMenuCheckboxes()}</div>
    <div>{DropdownMenuRadioGroupDemo()}</div>
    <div>{ModelsDropdownDemo()}</div>
    <div>{ModelsDropdownRadioGroupDemo()}</div>
    <div>{DropdownMenuSearchbarDemo()}</div>
  </div>
);

function SimpleDropdownDemo() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Open Simple Dropdown</DropdownMenuTrigger>
      <DropdownMenuContent>
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
          description="Anthropic's latest Claude 3.5 Sonnet model (200k context)."
        />
        <DropdownMenuItem
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
          <DropdownMenuItem icon={UserIcon} label="Profile" />
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
      <DropdownMenuContent className="s-w-56">
        <DropdownMenuLabel label="Appearance" />
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={showStatusBar}
          onCheckedChange={setShowStatusBar}
        >
          Status Bar
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={showActivityBar}
          onCheckedChange={setShowActivityBar}
          disabled
        >
          Activity Bar
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={showPanel}
          onCheckedChange={setShowPanel}
        >
          Panel
        </DropdownMenuCheckboxItem>
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
        <Button label={selectedModel} variant="outline" size="sm" />
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

function DropdownMenuSearchbarDemo() {
  const [searchText, setSearchText] = React.useState("");
  const [selectedItem, setSelectedItem] = React.useState<string | null>(null);

  const items = [
    "Automated Data Processing",
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label={selectedItem || "Select System"}
          variant="outline"
          size="sm"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="s-w-[300px]">
        <DropdownMenuSearchbar
          placeholder="Search systems..."
          name="search"
          value={searchText}
          onChange={setSearchText}
        />
        <DropdownMenuSeparator />
        <ScrollArea className="s-h-[200px]">
          {filteredItems.map((item) => (
            <DropdownMenuItem
              key={item}
              label={item}
              onClick={() => {
                setSelectedItem(item);
                setSearchText("");
              }}
            />
          ))}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
