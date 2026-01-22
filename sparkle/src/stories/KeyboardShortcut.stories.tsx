import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  KeyboardShortcut,
} from "@sparkle/index_with_tw_base";

const meta = {
  title: "Primitives/KeyboardShortcut",
  component: KeyboardShortcut,
} satisfies Meta<typeof KeyboardShortcut>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    shortcut: "Cmd+K",
  },
  render: () => (
    <div className="s-flex s-flex-col s-gap-2">
      <KeyboardShortcut shortcut="Shift+Cmd+P" />
      <KeyboardShortcut shortcut="Ctrl+Alt+Del" />
      <KeyboardShortcut shortcut="Cmd+K" />
      <KeyboardShortcut shortcut="ArrowUp+ArrowDown" />
    </div>
  ),
};

export const InDropdown: Story = {
  args: {
    shortcut: "Cmd+K",
  },
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button label="Open Menu" variant="outline" size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="s-w-56">
        <DropdownMenuItem label="Quick Open">
          <DropdownMenuShortcut shortcut="Cmd+K" />
        </DropdownMenuItem>
        <DropdownMenuItem label="Command Palette">
          <DropdownMenuShortcut shortcut="Shift+Cmd+P" />
        </DropdownMenuItem>
        <DropdownMenuItem label="Focus Search">
          <DropdownMenuShortcut shortcut="Ctrl+Alt+F" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};
