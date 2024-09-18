import type { Meta } from "@storybook/react";
import React from "react";

import {
  NewDropdownMenuGroup,
  NewDropdownMenuPortal,
  NewDropdownMenuShortcut,
  NewDropdownMenuSub,
  NewDropdownMenuSubContent,
  NewDropdownMenuSubTrigger,
} from "@sparkle/components/NewDropdown";

import {
  ArrowDownCircleIcon,
  ChatBubbleBottomCenterPlusIcon,
  CloudArrowDownIcon,
  Cog6ToothIcon,
  GithubLogo,
  Icon,
  LogoutIcon,
  MagicIcon,
  NewDropdownMenu,
  NewDropdownMenuContent,
  NewDropdownMenuItem,
  NewDropdownMenuLabel,
  NewDropdownMenuSeparator,
  NewDropdownMenuTrigger,
  UserIcon,
} from "../index_with_tw_base";

const meta = {
  title: "NewPrimitives/Dropdown",
  component: NewDropdownMenu,
} satisfies Meta<typeof NewDropdownMenu>;

export default meta;

export const ButtonExamples = () => (
  <div className="s-flex s-h-80 s-w-full s-flex-col s-items-center s-justify-center s-gap-4">
    <div>
      <NewDropdownMenu>
        <NewDropdownMenuTrigger variant="outline">
          Open Simple Dropdown
        </NewDropdownMenuTrigger>
        <NewDropdownMenuContent>
          <NewDropdownMenuLabel>My Account</NewDropdownMenuLabel>
          <NewDropdownMenuSeparator />
          <NewDropdownMenuItem>Profile</NewDropdownMenuItem>
          <NewDropdownMenuItem>Billing</NewDropdownMenuItem>
          <NewDropdownMenuItem>Team</NewDropdownMenuItem>
          <NewDropdownMenuItem>Subscription</NewDropdownMenuItem>
        </NewDropdownMenuContent>
      </NewDropdownMenu>
    </div>
    <div>
      <NewDropdownMenu>
        <NewDropdownMenuTrigger variant="primary">Open</NewDropdownMenuTrigger>
        <NewDropdownMenuContent className="w-56">
          <NewDropdownMenuLabel>My Account</NewDropdownMenuLabel>
          <NewDropdownMenuSeparator />
          <NewDropdownMenuGroup>
            <NewDropdownMenuItem>
              <Icon visual={UserIcon} size="xs" />
              Profile
              <NewDropdownMenuShortcut>⇧⌘P</NewDropdownMenuShortcut>
            </NewDropdownMenuItem>
            <NewDropdownMenuItem>
              <Icon visual={ArrowDownCircleIcon} size="xs" />
              Billing
              <NewDropdownMenuShortcut>⌘B</NewDropdownMenuShortcut>
            </NewDropdownMenuItem>
            <NewDropdownMenuItem>
              <Icon visual={Cog6ToothIcon} size="xs" />
              Settings
              <NewDropdownMenuShortcut>⌘S</NewDropdownMenuShortcut>
            </NewDropdownMenuItem>
            <NewDropdownMenuItem>
              <Icon visual={UserIcon} size="xs" />
              Keyboard shortcuts
              <NewDropdownMenuShortcut>⌘K</NewDropdownMenuShortcut>
            </NewDropdownMenuItem>
          </NewDropdownMenuGroup>
          <NewDropdownMenuSeparator />
          <NewDropdownMenuGroup>
            <NewDropdownMenuItem>
              <Icon visual={UserIcon} size="xs" />
              Team
            </NewDropdownMenuItem>
            <NewDropdownMenuSub>
              <NewDropdownMenuSubTrigger>
                <Icon visual={UserIcon} size="xs" />
                Invite users
              </NewDropdownMenuSubTrigger>
              <NewDropdownMenuPortal>
                <NewDropdownMenuSubContent>
                  <NewDropdownMenuItem>
                    <Icon visual={MagicIcon} size="xs" />
                    Email
                  </NewDropdownMenuItem>
                  <NewDropdownMenuItem>
                    <Icon visual={ChatBubbleBottomCenterPlusIcon} size="xs" />
                    Message
                  </NewDropdownMenuItem>
                  <NewDropdownMenuSeparator />
                  <NewDropdownMenuItem>
                    <Icon visual={UserIcon} size="xs" />
                    More...
                  </NewDropdownMenuItem>
                </NewDropdownMenuSubContent>
              </NewDropdownMenuPortal>
            </NewDropdownMenuSub>
            <NewDropdownMenuItem>
              <Icon visual={UserIcon} size="xs" />
              New Team
              <NewDropdownMenuShortcut>⌘+T</NewDropdownMenuShortcut>
            </NewDropdownMenuItem>
          </NewDropdownMenuGroup>
          <NewDropdownMenuSeparator />
          <NewDropdownMenuItem>
            <Icon visual={GithubLogo} size="xs" />
            GitHub
          </NewDropdownMenuItem>
          <NewDropdownMenuItem>
            <Icon visual={UserIcon} size="xs" />
            Support
          </NewDropdownMenuItem>
          <NewDropdownMenuItem disabled>
            <Icon visual={CloudArrowDownIcon} size="xs" />
            API
          </NewDropdownMenuItem>
          <NewDropdownMenuSeparator />
          <NewDropdownMenuItem>
            <Icon visual={LogoutIcon} size="xs" />
            Log out
            <NewDropdownMenuShortcut>⇧⌘Q</NewDropdownMenuShortcut>
          </NewDropdownMenuItem>
        </NewDropdownMenuContent>
      </NewDropdownMenu>
    </div>
  </div>
);
