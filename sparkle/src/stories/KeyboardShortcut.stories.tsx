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
  title: "Actions/KeyboardShortcut",
  component: KeyboardShortcut,
  parameters: {
    docs: {
      description: {
        component: `Renders a keyboard shortcut as styled key caps. Pass a \`shortcut\` string with parts joined by \`+\` (e.g. \`Cmd+K\`, \`Shift+Cmd+P\`, \`ArrowUp+ArrowDown\`); modifier and arrow names are normalized to platform symbols (⌘, ⌥, ⇧, →).

**When to use**
- To surface the keyboard accelerator for an action, e.g. next to a menu item or in a hint.

**Guidelines**
- Write parts separated by \`+\` and let the component handle symbol rendering — don't hardcode glyphs.
- Inside a dropdown, prefer **DropdownMenuShortcut** (which wraps this) via an item's \`endComponent\`.`,
      },
    },
  },
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
        <DropdownMenuItem
          label="Quick Open"
          endComponent={<DropdownMenuShortcut shortcut="Cmd+K" />}
        />
        <DropdownMenuItem
          label="Command Palette"
          endComponent={<DropdownMenuShortcut shortcut="Shift+Cmd+P" />}
        />
        <DropdownMenuItem
          label="Focus Search"
          endComponent={<DropdownMenuShortcut shortcut="Ctrl+Alt+F" />}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};
