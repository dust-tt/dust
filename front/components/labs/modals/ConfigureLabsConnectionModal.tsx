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
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";

import { DataSourceViewsSpaceSelector } from "@app/components/data_source_view/DataSourceViewsSpaceSelector";
import type { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
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
  existingConfiguration?: LabsConnectionsConfigurationResource;
}

export function ConfigureLabsConnectionModal({
  owner,
  connection,
  dataSourcesViews,
  spaces,
  isSpacesLoading,
  existingConfiguration,
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
      connectionId: connection.id,
    }
  );

  const [selectionConfigurations, setSelectionConfigurations] =
    useState<DataSourceViewSelectionConfigurations>({});
  const [apiKey, setApiKey] = useState("");
  const [pendingDataSourceView, setPendingDataSourceView] =
    useState<DataSourceViewType | null>(null);

  useEffect(() => {
    if (!dataSourcesViews.length || !configuration) {
      return;
    }

    const labsConnectionConfigurationRes =
      configuration as unknown as LabsConnectionsConfigurationResource;

    if (labsConnectionConfigurationRes.dataSourceViewId) {
      const dataSourceView = dataSourcesViews.find(
        (dsv) => dsv.id === labsConnectionConfigurationRes.dataSourceViewId
      );

      if (dataSourceView) {
        setSelectionConfigurations({
          [dataSourceView.sId]: {
            dataSourceView,
            selectedResources: [],
            isSelectAll: true,
            tagsFilter: null,
          },
        });
        setPendingDataSourceView(dataSourceView);
      }
    }
  }, [configuration, dataSourcesViews]);

  const handleSetSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  > = async (
    newValue: SetStateAction<DataSourceViewSelectionConfigurations>
  ) => {
    const newSelectionConfigurations =
      typeof newValue === "function"
        ? newValue(selectionConfigurations)
        : newValue;

    setSelectionConfigurations(newSelectionConfigurations);

    const keys = Object.keys(newSelectionConfigurations);
    if (keys.length > 0) {
      const selectedKey = keys[0];
      const selectedDsv =
        newSelectionConfigurations[selectedKey].dataSourceView;
      setPendingDataSourceView(selectedDsv);
    } else {
      setPendingDataSourceView(null);
    }
  };

  const onSaveApiKey = async () => {
    if (connection.authType !== "apiKey") {
      return;
    }

    if (!configuration && !apiKey) {
      sendNotification({
        type: "error",
        title: "Failed to save",
        description: "Please enter an API key before saving.",
      });
      return;
    }

    let success = false;

    if (configuration) {
      success = await updateConnectionConfiguration({
        apiKey,
        dataSourceViewId: pendingDataSourceView?.id ?? null,
      });
    } else {
      success = await createConnectionConfiguration({
        provider: connection.id,
        apiKey,
      });

      if (success && pendingDataSourceView) {
        success = await updateConnectionConfiguration({
          dataSourceViewId: pendingDataSourceView.id,
        });
      }
    }

    if (success) {
      await mutateConfiguration();
      sendNotification({
        type: "success",
        title: "Success!",
        description: configuration
          ? `${connection.label} configuration saved successfully.`
          : "Your settings have been saved successfully.",
      });
    } else {
      sendNotification({
        type: "error",
        title: "Failed to save",
        description: "Could not save your settings. Please try again.",
      });
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
        <Button
          label={existingConfiguration ? "Edit" : "Connect"}
          icon={Cog6ToothIcon}
          variant="outline"
        />
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
                            selectionMode="radio"
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
