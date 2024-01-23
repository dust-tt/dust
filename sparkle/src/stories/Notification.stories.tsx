import type { Meta } from "@storybook/react";
import React from "react";

import { Notification } from "../index_with_tw_base";

const meta = {
  title: "Atoms/Notification",
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
      </div>
    </>
  );
};
