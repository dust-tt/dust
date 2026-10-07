import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useSendNotification } from "@app/hooks/useNotification";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import { getDisplayNameForDataSource, isManaged } from "@app/lib/data_sources";
import { sendRequestDataSourceEmail } from "@app/lib/email";
import type { DataSourceType } from "@app/types/data_source";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Plus,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  TextArea,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import capitalize from "lodash/capitalize";
import { useEffect, useState } from "react";

interface RequestDataSourceModal {
  dataSources: DataSourceType[];
  owner: LightWorkspaceType;
}

export function RequestDataSourceModal({
  dataSources,
  owner,
}: RequestDataSourceModal) {
  const { t } = useLingui();
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
        title: t`Error sending email`,
        description: t`An unexpected error occurred while sending email.`,
      });
    } else {
      try {
        await sendRequestDataSourceEmail({
          emailMessage: message,
          dataSourceId: selectedDataSource.sId,
          owner,
        });
        const adminFullName = selectedDataSource.editedByUser.fullName;
        sendNotification({
          type: "success",
          title: t`Email sent!`,
          description: t`Your request was sent to ${adminFullName}.`,
        });
      } catch (e) {
        sendNotification({
          type: "error",
          title: t`Error sending email`,
          description: t`An unexpected error occurred while sending the request.`,
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

  const adminFullName = selectedDataSource?.editedByUser?.fullName;
  const adminDisplayName = capitalize(adminFullName ?? "");
  const selectedDataSourceName = selectedDataSource
    ? getDisplayNameForDataSource(selectedDataSource)
    : "";

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          label={t({ message: "Request", context: "verb, button label" })}
          icon={Plus}
        />
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>
            <Trans>Requesting data sources</Trans>
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center gap-2">
              {dataSources.length === 0 && (
                <label className="block text-sm font-medium text-muted-foreground">
                  <p>
                    <Trans>
                      You have no connection set up. Ask an admin to set one up.
                    </Trans>
                  </p>
                </label>
              )}
              {dataSources.length >= 1 && (
                <>
                  <label className="block text-sm font-medium text-muted-foreground">
                    <p>
                      <Trans>Where are the requested data hosted?</Trans>
                    </p>
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
                          label={t`Pick your platform`}
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
                <p className="mb-2 text-sm text-muted-foreground">
                  <Trans>
                    {adminDisplayName} is the administrator for the{" "}
                    {selectedDataSourceName} connection within Dust. Send an
                    email to {adminDisplayName}, explaining your request.
                  </Trans>
                </p>
                <TextArea
                  placeholder={t`Hello ${adminFullName},`}
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
            label: t`Cancel`,
            variant: "outline",
            onClick: onClose,
          }}
          {...(dataSources.length > 0 && {
            rightButtonProps: {
              label: t`Send`,
              onClick: onSave,
              disabled: message.length === 0,
            },
          })}
        />
      </SheetContent>
    </Sheet>
  );
}
