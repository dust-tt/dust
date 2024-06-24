import type { Meta } from "@storybook/react";
import React from "react";

import { Notification } from "../index_with_tw_base";

const meta = {
  title: "Modules/Notification",
  component: Notification,
} satisfies Meta<typeof Notification>;

export default meta;

export const NotificationExample = () => {
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
          description='Got: {"error":{"type":"invalid_request_error","message":"Invalid request body: Expecting string at name but instead got: undefined"}}'
          variant="error"
        />
      </div>
    </>
  );
};
