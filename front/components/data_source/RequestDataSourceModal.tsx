import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PlusIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  TextArea,
} from "@dust-tt/sparkle";
import * as _ from "lodash";
import { useEffect, useState } from "react";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useSendNotification } from "@app/hooks/useNotification";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import { getDisplayNameForDataSource, isManaged } from "@app/lib/data_sources";
import { sendRequestDataSourceEmail } from "@app/lib/email";
import type { DataSourceType, LightWorkspaceType } from "@app/types";

interface RequestDataSourceModal {
  dataSources: DataSourceType[];
  owner: LightWorkspaceType;
}

export function RequestDataSourceModal({
  dataSources,
  owner,
}: RequestDataSourceModal) {
  const { isDark } = useTheme();
  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSourceType | null>(null);

  const [message, setMessage] = useState("");
  const sendNotification = useSendNotification();

  useEffect(() => {
    if (dataSources.length === 1) {
      setSelectedDataSource(dataSources[0]);
    }
  }, [dataSources]);

  const onClose = () => {
    setMessage("");
    if (dataSources.length === 1) {
      setSelectedDataSource(dataSources[0]);
    }
  };

  const onSave = async () => {
    if (!selectedDataSource?.editedByUser) {
      sendNotification({
        type: "error",
        title: "Error sending email",
        description: "An unexpected error occurred while sending email.",
      });
    } else {
      try {
        await sendRequestDataSourceEmail({
          emailMessage: message,
          dataSourceId: selectedDataSource.sId,
          owner,
        });
        sendNotification({
          type: "success",
          title: "Email sent!",
          description: `Your request was sent to ${selectedDataSource.editedByUser.fullName}.`,
        });
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Error sending email",
          description:
            "An unexpected error occurred while sending the request.",
        });
        console.log(
          {
            dataSourceId: selectedDataSource.name,
            error: e,
          },
          "Error sending email"
        );
      }
      onClose();
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button label="Request" icon={PlusIcon} />
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Requesting Data sources</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center gap-2">
              {dataSources.length === 0 && (
                <label className="block text-sm font-medium text-muted-foreground dark:text-muted-foreground-night">
                  <p>
                    You have no connection set up. Ask an admin to set one up.
                  </p>
                </label>
              )}
              {dataSources.length >= 1 && (
                <>
                  <label className="block text-sm font-medium text-muted-foreground dark:text-muted-foreground-night">
                    <p>Where are the requested Data hosted?</p>
                  </label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      {selectedDataSource && isManaged(selectedDataSource) ? (
                        <Button
                          variant="outline"
                          label={getDisplayNameForDataSource(
                            selectedDataSource
                          )}
                          icon={getConnectorProviderLogoWithFallback({
                            provider: selectedDataSource.connectorProvider,
                            isDark,
                          })}
                        />
                      ) : (
                        <Button
                          label="Pick your platform"
                          variant="outline"
                          size="sm"
                          isSelect
                        />
                      )}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {dataSources.map(
                        (dataSource) =>
                          dataSource.connectorProvider && (
                            <DropdownMenuItem
                              key={dataSource.sId}
                              label={getDisplayNameForDataSource(dataSource)}
                              onClick={() => setSelectedDataSource(dataSource)}
                              icon={getConnectorProviderLogoWithFallback({
                                provider: dataSource.connectorProvider,
                                isDark,
                              })}
                            />
                          )
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>

            {selectedDataSource && (
              <div className="flex flex-col gap-2">
                <p className="mb-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
                  {_.capitalize(
                    selectedDataSource.editedByUser?.fullName ?? ""
                  )}{" "}
                  is the administrator for the{" "}
                  {getDisplayNameForDataSource(selectedDataSource)} connection
                  within Dust. Send an email to{" "}
                  {_.capitalize(
                    selectedDataSource.editedByUser?.fullName ?? ""
                  )}
                  , explaining your request.
                </p>
                <TextArea
                  placeholder={`Hello ${selectedDataSource.editedByUser?.fullName},`}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="mb-2"
                />
              </div>
            )}
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          {...(dataSources.length > 0 && {
            rightButtonProps: {
              label: "Send",
              onClick: onSave,
              disabled: message.length === 0,
            },
          })}
        />
      </SheetContent>
    </Sheet>
  );
}
