import { DropdownMenuCheckboxItemProps } from "@radix-ui/react-dropdown-menu";
import type { Meta } from "@storybook/react";
import React from "react";

import {
  NewDropdownMenu,
  NewDropdownMenuCheckboxItem,
  NewDropdownMenuContent,
  NewDropdownMenuGroup,
  NewDropdownMenuItem,
  NewDropdownMenuLabel,
  NewDropdownMenuPortal,
  NewDropdownMenuRadioGroup,
  NewDropdownMenuRadioItem,
  NewDropdownMenuSeparator,
  NewDropdownMenuSub,
  NewDropdownMenuSubContent,
  NewDropdownMenuSubTrigger,
  NewDropdownMenuTrigger,
} from "@sparkle/components/NewDropdown";
import {
  AnthropicLogo,
  GithubLogo,
  MistralLogo,
  OpenaiLogo,
} from "@sparkle/logo/platforms";

import {
  ArrowDownCircleIcon,
  Button,
  ChatBubbleBottomCenterPlusIcon,
  CloudArrowDownIcon,
  Cog6ToothIcon,
  LogoutIcon,
  MagicIcon,
  UserGroupIcon,
  UserIcon,
} from "../index_with_tw_base";

const meta = {
  title: "NewPrimitives/Dropdown",
  component: NewDropdownMenu,
} satisfies Meta<typeof NewDropdownMenu>;

export default meta;

export const DropdownExamples = () => (
  <div className="s-flex s-h-80 s-w-full s-flex-col s-items-center s-justify-center s-gap-4">
    <div>{SimpleDropdownDemo()}</div>
    <div>{ComplexDropdownDemo()}</div>
    <div>{DropdownMenuCheckboxes()}</div>
    <div>{DropdownMenuRadioGroupDemo()}</div>
    <div>{ModelsDropdownDemo()}</div>
    <div>{ModelsDropdownRadioGroupDemo()}</div>
  </div>
);

function SimpleDropdownDemo() {
  return (
    <NewDropdownMenu>
      <NewDropdownMenuTrigger>Open Simple Dropdown</NewDropdownMenuTrigger>
      <NewDropdownMenuContent>
        <NewDropdownMenuLabel label="My Account" />
        <NewDropdownMenuItem label="Profile" />
        <NewDropdownMenuItem label="Billing" />
        <NewDropdownMenuItem label="Team" />
        <NewDropdownMenuItem label="Subscription" />
      </NewDropdownMenuContent>
    </NewDropdownMenu>
  );
}

function ComplexDropdownDemo() {
  return (
    <NewDropdownMenu>
      <NewDropdownMenuTrigger>Open Complex</NewDropdownMenuTrigger>
      <NewDropdownMenuContent className="s-w-56">
        <NewDropdownMenuLabel label="My Account" />
        <NewDropdownMenuGroup>
          <NewDropdownMenuItem icon={UserIcon} label="Profile" />
          <NewDropdownMenuItem icon={ArrowDownCircleIcon} label="Billing" />
          <NewDropdownMenuItem icon={Cog6ToothIcon} label="Settings" />
          <NewDropdownMenuItem icon={UserIcon} label="Keyboard shortcuts" />
        </NewDropdownMenuGroup>
        <NewDropdownMenuSeparator />
        <NewDropdownMenuGroup>
          <NewDropdownMenuLabel label="Team" />
          <NewDropdownMenuItem icon={UserIcon} label="Members" />
          <NewDropdownMenuSub>
            <NewDropdownMenuSubTrigger icon={UserIcon} label="Invite users" />
            <NewDropdownMenuPortal>
              <NewDropdownMenuSubContent>
                <NewDropdownMenuItem icon={MagicIcon} label="Email" />
                <NewDropdownMenuItem
                  icon={ChatBubbleBottomCenterPlusIcon}
                  label="Message"
                />
                <NewDropdownMenuSeparator />
                <NewDropdownMenuItem icon={UserIcon} label="More..." />
              </NewDropdownMenuSubContent>
            </NewDropdownMenuPortal>
          </NewDropdownMenuSub>
          <NewDropdownMenuItem icon={UserGroupIcon} label="New Team" />
        </NewDropdownMenuGroup>
        <NewDropdownMenuSeparator />
        <NewDropdownMenuItem icon={GithubLogo} label="GitHub" />
        <NewDropdownMenuItem icon={UserIcon} label="Support" />
        <NewDropdownMenuItem icon={CloudArrowDownIcon} label="API" disabled />
        <NewDropdownMenuSeparator />
        <NewDropdownMenuItem icon={LogoutIcon} label="Log out" />
      </NewDropdownMenuContent>
    </NewDropdownMenu>
  );
}

type Checked = DropdownMenuCheckboxItemProps["checked"];

function DropdownMenuCheckboxes() {
  const [showStatusBar, setShowStatusBar] = React.useState<Checked>(true);
  const [showActivityBar, setShowActivityBar] = React.useState<Checked>(false);
  const [showPanel, setShowPanel] = React.useState<Checked>(false);

  return (
    <NewDropdownMenu>
      <NewDropdownMenuTrigger>Open Checkbox</NewDropdownMenuTrigger>
      <NewDropdownMenuContent className="s-w-56">
        <NewDropdownMenuLabel label="Appearance" />
        <NewDropdownMenuSeparator />
        <NewDropdownMenuCheckboxItem
          checked={showStatusBar}
          onCheckedChange={setShowStatusBar}
        >
          Status Bar
        </NewDropdownMenuCheckboxItem>
        <NewDropdownMenuCheckboxItem
          checked={showActivityBar}
          onCheckedChange={setShowActivityBar}
          disabled
        >
          Activity Bar
        </NewDropdownMenuCheckboxItem>
        <NewDropdownMenuCheckboxItem
          checked={showPanel}
          onCheckedChange={setShowPanel}
        >
          Panel
        </NewDropdownMenuCheckboxItem>
      </NewDropdownMenuContent>
    </NewDropdownMenu>
  );
}

function DropdownMenuRadioGroupDemo() {
  const [position, setPosition] = React.useState("bottom");

  return (
    <NewDropdownMenu>
      <NewDropdownMenuTrigger>Open Radio Group</NewDropdownMenuTrigger>
      <NewDropdownMenuContent className="s-w-56">
        <NewDropdownMenuLabel label="Panel Position" />
        <NewDropdownMenuSeparator />
        <NewDropdownMenuRadioGroup value={position} onValueChange={setPosition}>
          <NewDropdownMenuRadioItem value="top">Top</NewDropdownMenuRadioItem>
          <NewDropdownMenuRadioItem value="bottom">
            Bottom
          </NewDropdownMenuRadioItem>
          <NewDropdownMenuRadioItem value="right">
            Right
          </NewDropdownMenuRadioItem>
        </NewDropdownMenuRadioGroup>
      </NewDropdownMenuContent>
    </NewDropdownMenu>
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
    <NewDropdownMenu>
      <NewDropdownMenuTrigger>
        <Button
          type="select"
          labelVisible={true}
          label={selectedModel}
          variant="secondary"
          hasMagnifying={false}
          size="sm"
        />
      </NewDropdownMenuTrigger>
      <NewDropdownMenuContent>
        <NewDropdownMenuLabel label="Best performing models" />
        {bestPerformingModels.map((modelConfig) => (
          <NewDropdownMenuItem
            key={modelConfig.name}
            label={modelConfig.name}
            onClick={() => setSelectedModel(modelConfig.name)}
            description={modelConfig.description}
            icon={modelConfig.icon}
          />
        ))}
      </NewDropdownMenuContent>
    </NewDropdownMenu>
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
    <NewDropdownMenu>
      <NewDropdownMenuTrigger>
        <Button
          type="select"
          labelVisible={true}
          label={selectedModel}
          variant="secondary"
          hasMagnifying={false}
          size="sm"
        />
      </NewDropdownMenuTrigger>
      <NewDropdownMenuContent>
        <NewDropdownMenuRadioGroup
          value={selectedModel}
          onValueChange={(value) => setSelectedModel(value)}
        >
          <NewDropdownMenuLabel label="Best performing models" />
          {bestPerformingModels.map((modelConfig) => (
            <NewDropdownMenuRadioItem
              key={modelConfig.name}
              label={modelConfig.name}
              icon={modelConfig.icon}
              description={modelConfig.description}
              value={modelConfig.name}
            />
          ))}
        </NewDropdownMenuRadioGroup>
      </NewDropdownMenuContent>
    </NewDropdownMenu>
  );
}
