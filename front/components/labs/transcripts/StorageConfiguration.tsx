import {
  ChatBubbleThoughtIcon,
  ContentMessage,
  Page,
  SliderToggle,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  WorkspaceType,
} from "@dust-tt/types";
import type { Dispatch, SetStateAction } from "react";
import type { KeyedMutator } from "react-query";

import { DataSourceViewsSpaceSelector } from "@app/components/data_source_view/DataSourceViewsSpaceSelector";
import { useTranscriptConfiguration } from "@app/lib/labs/transcripts/use_transcript_configuration";

interface StorageConfigurationProps {
  owner: WorkspaceType;
  transcriptsConfiguration: any;
  dataSourcesViews: DataSourceViewType[];
  spaces: any[];
  isSpacesLoading: boolean;
  storeInFolder: boolean;
  handleSetStoreInFolder:
    | Dispatch<SetStateAction<boolean>>
    | KeyedMutator<GetLabsTranscriptsConfigurationResponseBody>;
  selectionConfigurations: DataSourceViewSelectionConfigurations;
  handleSetSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  >;
  onStateChange:
    | (() => Promise<void>)
    | KeyedMutator<GetLabsTranscriptsConfigurationResponseBody>;
}

export function StorageConfiguration({
  owner,
  transcriptsConfiguration,
  dataSourcesViews,
  spaces,
  isSpacesLoading,
  storeInFolder,
  handleSetStoreInFolder,
  selectionConfigurations,
  handleSetSelectionConfigurations,
  onStateChange,
}: StorageConfigurationProps) {
  const { makePatchRequest } = useTranscriptConfiguration({
    workspaceId: owner.sId,
    transcriptConfigurationId: transcriptsConfiguration.id,
    mutateTranscriptsConfiguration: onStateChange,
  });

  const handleSetDataSource = async (
    dataSourceView: DataSourceViewType | null
  ) => {
    await makePatchRequest(
      {
        dataSourceViewId: dataSourceView ? dataSourceView.sId : null,
      },
      dataSourceView
        ? `The transcripts will be stored in the folder ${dataSourceView.dataSource.name}`
        : "The transcripts will not be stored."
    );
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
                onDataSourceViewSelect={handleSetDataSource}
              />
            )}
          </div>
        </div>
      </Page.Layout>
    </Page.Layout>
  );
}
