import type { Meta } from "@storybook/react";
import React from "react";

import {
  NotificationContent,
  useSendNotification,
} from "@sparkle/components/Notification";

import { Button, Notification } from "../index_with_tw_base";

const meta: Meta<typeof Notification> = {
  title: "Modules/Notification",
} satisfies Meta<typeof Notification>;

export default meta;

/** Notification shown inline (no toast) for design iteration. */
export const Inline = () => {
  return (
    <div className="s-flex s-flex-col s-gap-4">
      <NotificationContent
        type="success"
        title="Success"
        description="Operation completed successfully"
      />
      <NotificationContent
        type="error"
        title="Error"
        description="Something went wrong"
      />
      <NotificationContent
        type="info"
        title="Info"
        description="Some information"
      />
      <NotificationContent
        type="hello"
        title="You have a message"
        description="A friendly notification"
      />
    </div>
  );
};

/** Same as Inline but with longer titles and descriptions (tests line-clamp). */
export const InlineLongText = () => {
  return (
    <div className="s-flex s-flex-col s-gap-4">
      <NotificationContent
        type="success"
        title="Your workspace has been successfully updated and all changes were saved"
        description="We've applied the new settings across all projects and notified your team members. You can review the full changelog in the activity feed or revert any change within 30 days."
      />
      <NotificationContent
        type="error"
        title="Failed to sync data with the external service"
        description="The connection timed out after several retries. Please check your network and API credentials, then try again. If the problem persists, contact support with the request ID shown in the logs."
      />
      <NotificationContent
        type="info"
        title="A new version of the app is available with performance improvements"
        description="This release includes faster load times, updated dependencies, and bug fixes. We recommend updating when convenient. The update will be applied automatically on your next session."
      />
      <NotificationContent
        type="hello"
        title="You have a message"
        description="Your team left a few comments and assigned you new tasks. Head over to your inbox to see what's new and respond when you have a moment."
      />
    </div>
  );
};

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
      <Button
        onClick={() =>
          sendNotification({
            title: "Hello",
            description: "A friendly notification",
            type: "hello",
          })
        }
        label="Show Hello"
      />
    </div>
  );
};
