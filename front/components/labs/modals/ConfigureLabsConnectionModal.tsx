import {
  Button,
  Cog6ToothIcon,
  ContextItem,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  TrashIcon,
} from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import type { SetStateAction } from "react";
import { useState } from "react";

import { DataSourceViewsSpaceSelector } from "@app/components/data_source_view/DataSourceViewsSpaceSelector";
import {
  useCreateLabsConnectionConfiguration,
  useDeleteLabsConnectionConfiguration,
  useLabsConnectionConfiguration,
  useUpdateLabsConnectionConfiguration,
} from "@app/lib/swr/labs";
import type {
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  LabsConnectionItemType,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";

interface ConfigureLabsConnectionModal {
  owner: LightWorkspaceType;
  connection: LabsConnectionItemType;
  dataSourcesViews: DataSourceViewType[];
  spaces: SpaceType[];
  isSpacesLoading: boolean;
  configuration?: {
    id: string;
    credentialId: string | null;
  };
}

export function ConfigureLabsConnectionModal({
  owner,
  connection,
  dataSourcesViews,
  spaces,
  isSpacesLoading,
  configuration: initialConfiguration,
}: ConfigureLabsConnectionModal) {
  const sendNotification = useSendNotification();
  const updateConnectionConfiguration = useUpdateLabsConnectionConfiguration({
    workspaceId: owner.sId,
    connectionId: connection.id,
  });
  const createConnectionConfiguration = useCreateLabsConnectionConfiguration({
    workspaceId: owner.sId,
  });
  const deleteConnectionConfiguration = useDeleteLabsConnectionConfiguration({
    workspaceId: owner.sId,
    connectionId: connection.id,
  });
  const { configuration, mutateConfiguration } = useLabsConnectionConfiguration(
    {
      workspaceId: owner.sId,
    }
  );

  const [selectionConfigurations, setSelectionConfigurations] =
    useState<DataSourceViewSelectionConfigurations>({});
  const [apiKey, setApiKey] = useState("");

  const handleSetConnectionStorageDataSourceView = async (
    dataSourceView: DataSourceViewType | null
  ) => {
    const success = await updateConnectionConfiguration({
      dataSourceViewId: dataSourceView ? dataSourceView.id : null,
    });

    if (success) {
      await mutateConfiguration();
      sendNotification({
        type: "success",
        title: "Success!",
        description: dataSourceView
          ? "We will now store your connection data."
          : "We will no longer store your connection data.",
      });
    } else {
      sendNotification({
        type: "error",
        title: "Failed to update",
        description: "Could not update the configuration. Please try again.",
      });
    }
  };

  const handleSetSelectionConfigurations = async (
    newValue: SetStateAction<DataSourceViewSelectionConfigurations>
  ) => {
    const newSelectionConfigurations =
      typeof newValue === "function"
        ? newValue(selectionConfigurations)
        : newValue;

    const keys = Object.keys(newSelectionConfigurations);

    if (keys.length === 0) {
      return;
    }

    const lastKey = keys[keys.length - 1];

    // If there's no change in the selection, return early
    if (
      lastKey &&
      JSON.stringify(selectionConfigurations[lastKey]) ===
        JSON.stringify(newSelectionConfigurations[lastKey])
    ) {
      return;
    }

    setSelectionConfigurations(
      lastKey ? { [lastKey]: newSelectionConfigurations[lastKey] } : {}
    );

    if (lastKey) {
      await handleSetConnectionStorageDataSourceView(
        newSelectionConfigurations[lastKey].dataSourceView
      );
    }
  };

  const onSaveApiKey = async () => {
    if (connection.authType === "apiKey") {
      if (initialConfiguration) {
        // Update existing configuration
        const success = await updateConnectionConfiguration({
          credentialId: apiKey,
        });

        if (success) {
          await mutateConfiguration();
          sendNotification({
            type: "success",
            title: "Success!",
            description: "Your API key has been saved successfully.",
          });
        } else {
          sendNotification({
            type: "error",
            title: "Failed to save",
            description: "Could not save your API key. Please try again.",
          });
        }
      } else {
        // Create new configuration
        const success = await createConnectionConfiguration({
          provider: connection.id,
          credentialId: apiKey,
        });

        if (success) {
          await mutateConfiguration();
          sendNotification({
            type: "success",
            title: "Success!",
            description: "Your API key has been saved successfully.",
          });
        } else {
          sendNotification({
            type: "error",
            title: "Failed to save",
            description: "Could not save your API key. Please try again.",
          });
        }
      }
    }
  };

  const onDisconnect = async () => {
    const success = await deleteConnectionConfiguration();
    if (success) {
      await mutateConfiguration();
      setApiKey("");
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button label="Connect" icon={Cog6ToothIcon} variant="outline" />
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>[Beta] Connection configuration</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-2">
              <Page.Layout direction="horizontal">
                <div className="flex flex-col gap-2">
                  <ContextItem.Visual visual={connection.logo} />
                  <Page.SectionHeader
                    title={connection.label}
                    description={connection.description}
                  />
                </div>
                {configuration && (
                  <div className="flex flex-1 justify-end">
                    <Button
                      label="Disconnect"
                      variant="warning"
                      icon={TrashIcon}
                      onClick={onDisconnect}
                    />
                  </div>
                )}
              </Page.Layout>

              <p className="text-element-700 mb-2 text-sm">
                {`This feature is currently in beta. We would love to hear from you once you test it out!`}
              </p>

              {!configuration && (
                <>
                  {connection.authType === "apiKey" && (
                    <div className="flex flex-col gap-2">
                      <label className="text-element-900 text-sm font-medium">
                        {connection.label} API Key
                      </label>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="border-structure-200 text-element-900 rounded-md border bg-white px-3 py-2 text-sm"
                        placeholder="Enter your API key"
                      />
                      <Button
                        label="Connect"
                        onClick={onSaveApiKey}
                        disabled={!apiKey}
                      />
                    </div>
                  )}
                </>
              )}

              {configuration && (
                <Page.Layout direction="vertical">
                  <Page.SectionHeader
                    title="Store data"
                    description={`Pick the location where we should store ${connection.label} data`}
                  />

                  <Page.Layout direction="horizontal">
                    <div className="w-full">
                      <div className="overflow-x-auto">
                        {!isSpacesLoading && selectionConfigurations && (
                          <DataSourceViewsSpaceSelector
                            useCase="transcriptsProcessing"
                            dataSourceViews={dataSourcesViews}
                            allowedSpaces={spaces}
                            owner={owner}
                            selectionConfigurations={selectionConfigurations}
                            setSelectionConfigurations={
                              handleSetSelectionConfigurations
                            }
                            viewType="document"
                            isRootSelectable={true}
                          />
                        )}
                      </div>
                    </div>
                  </Page.Layout>
                </Page.Layout>
              )}
            </div>
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Save",
            onClick: onSaveApiKey,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
