import type { Meta } from "@storybook/react";
import React from "react";

import { NotificationButton } from "@sparkle/components";
import { InfoCircle } from "@sparkle/icons";

const meta = {
  title: "Components/NotificationButton",
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
