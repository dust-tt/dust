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
  args: {
    shortcut: "Cmd+K",
  },
} satisfies Meta<typeof KeyboardShortcut>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A single shortcut string: parts joined by `+` are rendered as key caps
 * with platform symbols.
 *
 * @summary One shortcut rendered as key caps.
 */
export const Default: Story = {};

/**
 * How the normalizer handles modifiers, multi-part combos, and arrow keys —
 * write the names, never the glyphs.
 *
 * @summary Modifier and arrow-key normalization.
 */
export const ModifierFormats: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <KeyboardShortcut shortcut="Shift+Cmd+P" />
      <KeyboardShortcut shortcut="Ctrl+Alt+Del" />
      <KeyboardShortcut shortcut="ArrowUp+ArrowDown" />
    </div>
  ),
};

/**
 * Inside a dropdown, use `DropdownMenuShortcut` (which wraps this component)
 * via the item's `endComponent` slot.
 *
 * @summary Shortcuts on dropdown menu items.
 */
export const InDropdown: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button label="Open Menu" variant="outline" size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
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
