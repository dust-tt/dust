import type { Meta } from "@storybook/react";
import React from "react";

import { NotificationButton } from "@sparkle/components";
import { InfoCircleV2 } from "@sparkle/icons";

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
          icon: InfoCircleV2,
          label: "InfoCircleV2",
        }}
        counterProps={{
          value: 1,
          variant: "highlight",
          size: "sm",
        }}
      />
      <NotificationButton
        buttonProps={{
          icon: InfoCircleV2,
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
