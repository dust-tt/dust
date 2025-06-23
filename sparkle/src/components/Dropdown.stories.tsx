import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { UserIcon } from "@sparkle/icons/app";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./Dropdown";

const meta: Meta<typeof DropdownMenu> = {
  title: "Components/Dropdown",
  component: DropdownMenu,
};

export default meta;
type Story = StoryObj<typeof DropdownMenu>;

export const Default: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger>Open Menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          label="Test Item"
          icon={UserIcon}
          href="/test"
          onClick={() => console.log("Clicked!")}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};
