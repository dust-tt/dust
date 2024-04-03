import type { Meta } from "@storybook/react";
import React from "react";

import { Notification } from "../index_with_tw_base";

const meta = {
  title: "Modules/Notification",
  component: Notification,
} satisfies Meta<typeof Notification>;

export default meta;

export const DropdownExample = () => {
  return (
    <>
      <div className="s-flex s-gap-6">
        <Notification
          title="Success"
          description="This is a success notification"
          variant="success"
        />
        <Notification
          title="Failure"
          description="This is a success notification"
          variant="error"
        />
        <div>
          <Notification title="Failure" variant="error" />
        </div>
        <Notification
          title="Failure with a very long title clamped on one line."
          description="This is a very long failure notification with some messy content. Hopefully it should be truncated in the UI after 3 very long lines!"
          variant="error"
        />
      </div>
    </>
  );
};
