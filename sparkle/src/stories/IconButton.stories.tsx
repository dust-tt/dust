import type { Meta, StoryObj } from "@storybook/react";

import { Settings01, IconButton } from "../index_with_tw_base";

const meta = {
  title: "Actions/IconButton",
  tags: ["deprecated", "!manifest"],
  component: IconButton,
  parameters: {
    docs: {
      description: {
        component: `**Deprecated — use Button with an \`icon\` and no \`label\` instead** (keep a \`tooltip\` so the action stays accessible): \`<Button icon={Settings01} tooltip="Settings" variant="ghost" size="sm" />\`. See the **IconButtons** story under Actions/Button. Kept only as a visual reference for legacy product surfaces.

A compact, label-less button rendered as a single **icon**. It comes in several visual **variant**s (\`primary\`, \`highlight\`, \`ghost\`, …) and **size**s, and accepts an optional \`tooltip\` to convey its meaning.

**When to use**
- For dense toolbars or inline controls where a full labelled button would be too large.
- For ubiquitous, self-explanatory actions (settings, close, edit).

**Guidelines**
- Always provide a \`tooltip\` (or accessible label) — the icon alone may not convey the action.
- Choose an icon whose meaning is unambiguous; otherwise use a labelled **Button**.
- For a primary call-to-action that benefits from a label, prefer **Button** over **IconButton**.`,
      },
    },
  },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The default form: `primary` variant with a `tooltip`. Always pass a
 * tooltip — the icon alone may not convey the action.
 *
 * @summary Primary icon button with its required tooltip.
 */
export const IconButtonPrimary: Story = {
  args: {
    variant: "primary",
    size: "md",
    tooltip: "Your settings",
    icon: Settings01,
  },
};

/**
 * The `highlight` variant, for the one emphasized action in a toolbar.
 *
 * @summary Highlight variant for an emphasized action.
 */
export const IconButtonHighlight: Story = {
  args: {
    variant: "highlight",
    tooltip: "Your settings",
    icon: Settings01,
  },
};

/**
 * The `ghost` variant, for low-emphasis inline controls that should not
 * compete with surrounding content.
 *
 * @summary Ghost variant for low-emphasis inline actions.
 */
export const IconButtonGhost: Story = {
  args: {
    variant: "ghost",
    tooltip: "Your settings",
    icon: Settings01,
  },
};
