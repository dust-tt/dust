import {
  ChatBubbleThoughtIcon,
  ContentMessage,
  Page,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import type {
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  WorkspaceType,
} from "@dust-tt/types";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";
import type { KeyedMutator } from "swr";

import { DataSourceViewsSpaceSelector } from "@app/components/data_source_view/DataSourceViewsSpaceSelector";
import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import type { GetLabsTranscriptsConfigurationResponseBody } from "@app/pages/api/w/[wId]/labs/transcripts";
import type { PatchTranscriptsConfiguration } from "@app/pages/api/w/[wId]/labs/transcripts/[tId]";

interface StorageConfigurationProps {
  owner: WorkspaceType;
  transcriptsConfiguration: LabsTranscriptsConfigurationResource;
  mutateTranscriptsConfiguration:
    | (() => Promise<void>)
    | KeyedMutator<GetLabsTranscriptsConfigurationResponseBody>;
  dataSourcesViews: DataSourceViewType[];
  spaces: any[];
  isSpacesLoading: boolean;
}

export function StorageConfiguration({
  owner,
  transcriptsConfiguration,
  mutateTranscriptsConfiguration,
  dataSourcesViews,
  spaces,
  isSpacesLoading,
}: StorageConfigurationProps) {
  const sendNotification = useSendNotification();

  const [storeInFolder, setStoreInFolder] = useState(false);
  const [selectionConfigurations, setSelectionConfigurations] =
    useState<DataSourceViewSelectionConfigurations>({});
  const workspaceId = owner.sId;
  const transcriptConfigurationId = transcriptsConfiguration.id;

  useEffect(() => {
    setStoreInFolder(transcriptsConfiguration.dataSourceViewId !== null);
  }, [transcriptsConfiguration.dataSourceViewId]);

  const makePatchRequest = async (
    data: Partial<PatchTranscriptsConfiguration>,
    successMessage: string
  ) => {
    const response = await fetch(
      `/api/w/${workspaceId}/labs/transcripts/${transcriptConfigurationId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      sendNotification({
        type: "error",
        title: "Failed to update",
        description: "Could not update the configuration. Please try again.",
      });
      return;
    }

    sendNotification({
      type: "success",
      title: "Success!",
      description: successMessage,
    });

    await mutateTranscriptsConfiguration();
  };

  const handleSetDataSource = async (
    transcriptConfigurationId: number,
    dataSourceView: DataSourceViewType | null
  ) => {
    let successMessage = "The transcripts will not be stored.";

    if (dataSourceView) {
      successMessage =
        "The transcripts will be stored in the folder " +
        dataSourceView.dataSource.name;
    } else {
      successMessage = "The transcripts will not be stored.";
    }

    await makePatchRequest(
      {
        dataSourceViewId: dataSourceView?.sId ?? null,
      },
      successMessage
    );

    await mutateTranscriptsConfiguration();
  };

  const handleSetStoreInFolder: Dispatch<SetStateAction<boolean>> = async (
    newValue
  ) => {
    if (!transcriptsConfiguration) {
      return;
    }

    setStoreInFolder(newValue);

    if (!newValue) {
      // When disabling storage, clear the data source view
      await handleSetDataSource(transcriptsConfiguration.id, null);
      setSelectionConfigurations({});
    } else if (transcriptsConfiguration.dataSourceViewId) {
      // When enabling storage, restore the previous data source view if it exists
      const dataSourceView = dataSourcesViews.find(
        (ds) => ds.id === transcriptsConfiguration.dataSourceViewId
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
      }
    }
  };

  const handleSetSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  > = async (newValue) => {
    if (!transcriptsConfiguration) {
      return;
    }

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
      const datasourceView = newSelectionConfigurations[lastKey].dataSourceView;
      await handleSetDataSource(transcriptsConfiguration.id, datasourceView);
    }
  };

  return (
    <Page.Layout direction="vertical">
      <Page.SectionHeader
        title="Store transcripts"
        description="After each transcribed meeting, store the full transcript in a Dust folder for later use."
      />
      {transcriptsConfiguration.isDefaultFullStorage && (
        <ContentMessage
          title="Default storage"
          variant="slate"
          size="lg"
          icon={ChatBubbleThoughtIcon}
        >
          Your configuration handles the storage of all your workspace's
          transcripts. Other users will not have the possibility to store their
          own transcripts.
        </ContentMessage>
      )}
      <Page.Layout direction="horizontal" gap="xl">
        <SliderToggle
          selected={storeInFolder}
          onClick={() => handleSetStoreInFolder(!storeInFolder)}
        />
        <Page.P>Enable transcripts storage</Page.P>
      </Page.Layout>
      <Page.Layout direction="horizontal">
        <div className="w-full">
          <div className="overflow-x-auto">
            {!isSpacesLoading && storeInFolder && selectionConfigurations && (
              <DataSourceViewsSpaceSelector
                useCase="transcriptsProcessing"
                dataSourceViews={dataSourcesViews}
                allowedSpaces={spaces}
                owner={owner}
                selectionConfigurations={selectionConfigurations}
                setSelectionConfigurations={handleSetSelectionConfigurations}
                viewType="document"
                isRootSelectable={true}
              />
            )}
          </div>
        </div>
      </Page.Layout>
    </Page.Layout>
  );
}
