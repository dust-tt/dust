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

import { DataSourceViewsSpaceSelector } from "@app/components/data_source_view/DataSourceViewsSpaceSelector";

interface StorageConfigurationProps {
  owner: WorkspaceType;
  transcriptsConfiguration: any;
  dataSourcesViews: DataSourceViewType[];
  spaces: any[];
  isSpacesLoading: boolean;
  storeInFolder: boolean;
  handleSetStoreInFolder: Dispatch<SetStateAction<boolean>>;
  selectionConfigurations: DataSourceViewSelectionConfigurations;
  handleSetSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  >;
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
}: StorageConfigurationProps) {
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
