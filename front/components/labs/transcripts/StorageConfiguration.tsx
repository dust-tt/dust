import {
  ChatBubbleThoughtIcon,
  ContentMessage,
  Page,
  SliderToggle,
} from "@dust-tt/sparkle";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";
import type { KeyedMutator } from "swr";

import { DataSourceViewsSpaceSelector } from "@app/components/data_source_view/DataSourceViewsSpaceSelector";
import { useUpdateTranscriptsConfiguration } from "@app/lib/swr/labs";
import type { GetLabsTranscriptsConfigurationResponseBody } from "@app/pages/api/w/[wId]/labs/transcripts";
import type {
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  LabsTranscriptsConfigurationType,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";

interface StorageConfigurationProps {
  owner: LightWorkspaceType;
  transcriptsConfiguration: LabsTranscriptsConfigurationType;
  mutateTranscriptsConfiguration:
    | (() => Promise<void>)
    | KeyedMutator<GetLabsTranscriptsConfigurationResponseBody>;
  dataSourcesViews: DataSourceViewType[];
  spaces: SpaceType[];
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
  const { doUpdate } = useUpdateTranscriptsConfiguration({
    owner,
    transcriptsConfiguration,
  });

  const [storeInFolder, setStoreInFolder] = useState(false);
  const [selectionConfigurations, setSelectionConfigurations] =
    useState<DataSourceViewSelectionConfigurations>({});

  useEffect(() => {
    setStoreInFolder(transcriptsConfiguration.dataSourceViewId !== null);

    if (transcriptsConfiguration.dataSourceViewId) {
      const dataSourceView = dataSourcesViews.find(
        (ds) => ds.id === transcriptsConfiguration.dataSourceViewId
      );
      if (dataSourceView) {
        setSelectionConfigurations({
          [dataSourceView.sId]: {
            dataSourceView,
            selectedResources: [],
            excludedResources: [],
            isSelectAll: true,
            tagsFilter: null,
          },
        });
      }
    } else {
      setSelectionConfigurations({});
    }
  }, [transcriptsConfiguration.dataSourceViewId, dataSourcesViews]);

  const handleSetTranscriptsStorageDataSourceView = async (
    dataSourceView: DataSourceViewType | null
  ) => {
    if (!transcriptsConfiguration) {
      return;
    }

    const response = await doUpdate({
      dataSourceViewId: dataSourceView ? dataSourceView.sId : null,
    });

    if (response.isOk()) {
      await mutateTranscriptsConfiguration();
    } else {
      setSelectionConfigurations({});
    }
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
      await handleSetTranscriptsStorageDataSourceView(null);
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
            excludedResources: [],
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
      await handleSetTranscriptsStorageDataSourceView(
        newSelectionConfigurations[lastKey].dataSourceView
      );
    }
  };

  return (
    <Page.Layout direction="vertical">
      <Page.SectionHeader
        title="Store transcripts"
        description="After each transcribed meeting, store the full transcript in a Dust folder for later use."
      />
      {transcriptsConfiguration.isDefaultWorkspaceConfiguration && (
        <ContentMessage
          title="Default storage"
          variant="primary"
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
