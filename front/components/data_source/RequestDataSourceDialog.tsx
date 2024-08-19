import { Dialog, TextArea } from "@dust-tt/sparkle";
import type { DataSourceType, WorkspaceType } from "@dust-tt/types";
import React, { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { sendRequestDataSourceEmail } from "@app/lib/email";
import logger from "@app/logger/logger";

export type RequestDataSourceProps = {
  isOpen: boolean;
  onClose: () => void;
  dataSource: DataSourceType;
  owner: WorkspaceType;
};

export function RequestDataSourceDialog({
  isOpen,
  onClose,
  dataSource,
  owner,
}: RequestDataSourceProps) {
  const [message, setMessage] = useState("");
  const sendNotification = useContext(SendNotificationsContext);

  const handleClose = () => {
    onClose();
    setMessage("");
  };

  const handleSend = async () => {
    const userToId = dataSource.editedByUser?.userId;
    if (!userToId) {
      sendNotification({
        type: "error",
        title: "Error sending email",
        description: "An unexpected error occurred while sending email.",
      });
    } else {
      try {
        await sendRequestDataSourceEmail({
          userTo: userToId,
          emailMessage: message,
          dataSourceName: dataSource.name,
          owner,
        });
        sendNotification({
          type: "success",
          title: "Email sent!",
          description: `Your request was sent to ${dataSource.editedByUser?.fullName}.`,
        });
        handleClose();
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Error sending email",
          description:
            "An unexpected error occurred while sending the request.",
        });
        logger.error(
          {
            userToId,
            dataSourceName: dataSource.name,
            error: e,
          },
          "Error sending email"
        );
      }
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onCancel={handleClose}
      title="Data Source Request"
      onValidate={handleSend}
    >
      <div className="flex flex-col gap-4">
        {dataSource.connectorProvider && (
          <>
            <p className="text-sm text-element-700">
              The administrator for{" "}
              {CONNECTOR_CONFIGURATIONS[dataSource.connectorProvider].name} is{" "}
              {dataSource.editedByUser?.fullName}. Send an email to{" "}
              {dataSource.editedByUser?.fullName}, explaining your request.
            </p>
            <TextArea
              placeholder={`Hello ${dataSource.editedByUser?.fullName},`}
              value={message}
              onChange={setMessage}
              className="mb-2"
            />
          </>
        )}
      </div>
    </Dialog>
  );
}
