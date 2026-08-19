import type { Meta, StoryObj } from "@storybook/react";

import { NotificationButton } from "@sparkle/components";
import { InfoCircle } from "@sparkle/icons";

const meta = {
  title: "Feedback & Status/NotificationButton",
  component: NotificationButton,
  tags: ["a11y-issues"],
  parameters: {
    docs: {
      description: {
        component: `A button with an overlaid counter badge for surfacing a pending count, such as unread notifications. Configure the trigger through **buttonProps** (a **Button** config — \`variant\`, \`size\`, \`icon\`, \`label\`) and the badge through **counterProps** (a **Counter** config — \`value\`, \`variant\` like \`highlight\` or \`warning\`, \`size\`).

**When to use**
- For a toolbar or header affordance that opens notifications/messages and shows how many are pending.

**Guidelines**
- Use the \`counterProps.variant\` to signal urgency (e.g. \`warning\` for items needing attention).
- For the toast messages themselves, use **Notification**; for a standalone count without a button, use **Counter**.`,
      },
    },
  },
} satisfies Meta<typeof NotificationButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A labeled outline button with a small highlight badge — the typical
 * header affordance for a notifications inbox with a modest unread count.
 * @summary Labeled button with a highlight counter badge.
 */
export const WithCount: Story = {
  args: {
    buttonProps: {
      variant: "outline",
      size: "md",
      icon: InfoCircle,
      label: "Notifications",
    },
    counterProps: {
      value: 1,
      variant: "highlight",
      size: "sm",
    },
  },
};

/**
 * A compact icon-only ghost button carrying a large warning count — the
 * minimal toolbar treatment when space is tight and the count signals
 * urgency.
 * @summary Icon-only ghost button with a high warning count.
 */
export const GhostWithHighCount: Story = {
  args: {
    buttonProps: {
      icon: InfoCircle,
      size: "sm",
      variant: "ghost",
    },
    counterProps: {
      value: 99,
      variant: "warning",
      size: "xs",
    },
  },
};
