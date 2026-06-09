import type { Meta } from "@storybook/react";
import React from "react";

import { NotificationButton } from "@sparkle/components";
import { InfoCircle } from "@sparkle/icons";

const meta = {
  title: "Feedback & Status/NotificationButton",
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

export const Example = () => {
  return (
    <div className="s-flex s-gap-4">
      <NotificationButton
        buttonProps={{
          variant: "outline",
          size: "md",
          icon: InfoCircle,
          label: "InfoCircle",
        }}
        counterProps={{
          value: 1,
          variant: "highlight",
          size: "sm",
        }}
      />
      <NotificationButton
        buttonProps={{
          icon: InfoCircle,
          size: "sm",
          variant: "ghost",
        }}
        counterProps={{
          value: 99,
          variant: "warning",
          size: "xs",
        }}
      />
    </div>
  );
};
