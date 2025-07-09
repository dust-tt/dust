import type { Meta } from "@storybook/react";
import React from "react";

import { useSendNotification } from "@sparkle/components/Notification";

import { Button, Notification } from "../index_with_tw_base";

const meta: Meta<typeof Notification> = {
  title: "Modules/Notification",
} satisfies Meta<typeof Notification>;

export default meta;

export const Example = () => {
  return (
    <Notification.Area>
      <NotificationExample />
    </Notification.Area>
  );
};

const NotificationExample = () => {
  const sendNotification = useSendNotification();

  return (
    <div className="s-flex s-flex-col s-gap-4">
      <Button
        onClick={() =>
          sendNotification({
            title: "Success",
            description: "Operation completed successfully",
            type: "success",
          })
        }
        label="Show Success"
      />
      <Button
        onClick={() =>
          sendNotification({
            title: "Error",
            description: "Something went wrong",
            type: "error",
          })
        }
        label="Show Error"
      />
      <Button
        onClick={() =>
          sendNotification({
            title: "Info",
            description: "Some information",
            type: "info",
          })
        }
        label="Show Info"
      />
    </div>
  );
};
