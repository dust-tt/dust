import { Button, DropdownMenu, Modal, TextArea } from "@dust-tt/sparkle";
import React, { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { sendEmail } from "@app/lib/email";
import logger from "@app/logger/logger";
import type { DataSourceIntegration } from "@app/pages/w/[wId]/builder/data-sources/managed";

type RequestDataSourceProps = {
  isOpen: boolean;
  onClose: () => void;
  dataSourceIntegrations: DataSourceIntegration[];
  currentUserEmail: string;
};

async function sendRequestDataSourceEmail({
  email,
  emailContent,
  dataSourceName,
  ccEmail,
}: {
  email: string;
  emailContent: string;
  dataSourceName: string;
  ccEmail?: string;
}) {
  const mail = {
    from: {
      name: "Dust team",
      email: "team@dust.tt",
    },
    subject: `[Dust] Request Data source - ${dataSourceName}`,
    html: `<p>${ccEmail} has sent you a request regarding the connection ${dataSourceName}</p>
    <p>Message:</p>
    <p>${emailContent}</p>
    <p>Email to: ${email}</p>`,
  };
  return sendEmail("belvezejules@gmail.com", mail);
}

export function RequestDataSourcesModal({
  isOpen,
  onClose,
  dataSourceIntegrations,
  currentUserEmail,
}: RequestDataSourceProps) {
  const [selectedDataSourceIntegration, setSelectedDataSourceIntegration] =
    useState<DataSourceIntegration | null>(null);
  const [message, setMessage] = useState("");
  const sendNotification = useContext(SendNotificationsContext);

  const filteredDataSourceIntegrations = dataSourceIntegrations.filter(
    (ds) => ds.connector
  );
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        onClose();
        setMessage("");
        setSelectedDataSourceIntegration(null);
      }}
      hasChanged={false}
      variant="side-md"
      title="Requesting Data sources"
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <label className="block text-sm font-medium text-element-800">
            {filteredDataSourceIntegrations.length ? (
              <p>Where are the requested Data hosted?</p>
            ) : (
              <p>You have no connection set up. Ask an admin to set one up.</p>
            )}
          </label>
          {!!filteredDataSourceIntegrations.length && (
            <DropdownMenu>
              <DropdownMenu.Button>
                {selectedDataSourceIntegration ? (
                  <Button
                    variant="tertiary"
                    label={
                      CONNECTOR_CONFIGURATIONS[
                        selectedDataSourceIntegration.connectorProvider
                      ].name
                    }
                    icon={
                      CONNECTOR_CONFIGURATIONS[
                        selectedDataSourceIntegration.connectorProvider
                      ].logoComponent
                    }
                  />
                ) : (
                  <Button
                    label="Pick your platform"
                    variant="tertiary"
                    size="sm"
                    type="select"
                  />
                )}
              </DropdownMenu.Button>
              <DropdownMenu.Items width={180}>
                {filteredDataSourceIntegrations.map((ds) => (
                  <DropdownMenu.Item
                    key={ds.dataSourceName}
                    label={ds.name}
                    onClick={() => setSelectedDataSourceIntegration(ds)}
                    icon={
                      CONNECTOR_CONFIGURATIONS[ds.connectorProvider]
                        .logoComponent
                    }
                  />
                ))}
              </DropdownMenu.Items>
            </DropdownMenu>
          )}
        </div>

        {selectedDataSourceIntegration && (
          <div>
            <p className="s-mb-2 s-text-sm s-text-element-700">
              The administrator for{" "}
              {
                CONNECTOR_CONFIGURATIONS[
                  selectedDataSourceIntegration.connectorProvider
                ].name
              }{" "}
              is {selectedDataSourceIntegration.editedByUser?.fullName}. Send an
              email to {selectedDataSourceIntegration.editedByUser?.fullName},
              explaining your request.
            </p>
            <TextArea
              placeholder={`Hello ${selectedDataSourceIntegration.editedByUser?.fullName},`}
              value={message}
              onChange={setMessage}
              className="s-mb-2"
            />
            <Button
              label="Send"
              variant="primary"
              size="sm"
              onClick={async () => {
                const userEmail =
                  selectedDataSourceIntegration?.editedByUser?.email;
                if (!userEmail || !selectedDataSourceIntegration) {
                  sendNotification({
                    type: "error",
                    title: "Error sending email",
                    description:
                      "An unexpected error occurred while sending email.",
                  });
                } else {
                  try {
                    await sendRequestDataSourceEmail({
                      email: userEmail,
                      emailContent: message,
                      dataSourceName: selectedDataSourceIntegration.name,
                      ccEmail: currentUserEmail,
                    });
                  } catch (e) {
                    logger.error(
                      {
                        userEmail,
                        currentUserEmail,
                        dataSourceName: selectedDataSourceIntegration.name,
                      },
                      "Error sending email"
                    );
                  }
                  setMessage("");
                  setSelectedDataSourceIntegration(null);
                  onClose();
                  sendNotification({
                    type: "success",
                    title: "Email sent!",
                    description: `Your request was sent to ${userEmail}.`,
                  });
                }
              }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
