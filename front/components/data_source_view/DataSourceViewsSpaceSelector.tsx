import { Spinner } from "@dust-tt/sparkle";
import type { Dispatch, SetStateAction } from "react";
import { useMemo } from "react";

import { SpaceSelector } from "@app/components/assistant_builder/spaces/SpaceSelector";
import type { useCaseDataSourceViewsSelector } from "@app/components/data_source_view/DataSourceViewSelector";
import { DataSourceViewsSelector } from "@app/components/data_source_view/DataSourceViewSelector";
import { useSpaces } from "@app/lib/swr/spaces";
import type {
  ContentNodesViewType,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";

interface DataSourceViewsSpaceSelectorProps {
  allowedSpaces?: SpaceType[];
  owner: LightWorkspaceType;
  dataSourceViews: DataSourceViewType[];
  useCase: useCaseDataSourceViewsSelector;
  selectionConfigurations: DataSourceViewSelectionConfigurations;
  setSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  >;
  viewType: ContentNodesViewType;
  isRootSelectable: boolean;
  selectionMode?: "checkbox" | "radio";
}

export const DataSourceViewsSpaceSelector = ({
  allowedSpaces,
  dataSourceViews,
  useCase,
  owner,
  selectionConfigurations,
  setSelectionConfigurations,
  viewType,
  isRootSelectable,
  selectionMode = "checkbox",
}: DataSourceViewsSpaceSelectorProps) => {
  const { spaces, isSpacesLoading } = useSpaces({ workspaceId: owner.sId });

  const defaultSpace = useMemo(() => {
    const firstKey = Object.keys(selectionConfigurations)[0] ?? null;
    return firstKey
      ? selectionConfigurations[firstKey]?.dataSourceView?.spaceId ?? ""
      : "";
  }, [selectionConfigurations]);

  const filteredSpaces = useMemo(() => {
    const spaceIds = [...new Set(dataSourceViews.map((dsv) => dsv.spaceId))];
    return spaces.filter((s) => spaceIds.includes(s.sId));
  }, [spaces, dataSourceViews]);

  if (isSpacesLoading) {
    return <Spinner />;
  }

  if (filteredSpaces.length === 1) {
    const [space] = filteredSpaces;
    const dataSourceViewsForSpace = space
      ? dataSourceViews.filter((dsv) => dsv.spaceId === space.sId)
      : dataSourceViews;

    return (
      <DataSourceViewsSelector
        owner={owner}
        useCase={useCase}
        dataSourceViews={dataSourceViewsForSpace}
        selectionConfigurations={selectionConfigurations}
        setSelectionConfigurations={setSelectionConfigurations}
        viewType={viewType}
        isRootSelectable={isRootSelectable}
        space={space}
        selectionMode={selectionMode}
      />
    );
  }

  return (
    <SpaceSelector
      spaces={filteredSpaces}
      allowedSpaces={allowedSpaces}
      defaultSpace={defaultSpace}
      renderChildren={(space) => {
        const dataSourceViewsForSpace = space
          ? dataSourceViews.filter((dsv) => dsv.spaceId === space.sId)
          : dataSourceViews;

        if (dataSourceViewsForSpace.length === 0) {
          return <>No data source in this space.</>;
        }

        if (!space) {
          return <>No space selected.</>;
        }

        return (
          <DataSourceViewsSelector
            owner={owner}
            useCase={useCase}
            dataSourceViews={dataSourceViewsForSpace}
            selectionConfigurations={selectionConfigurations}
            setSelectionConfigurations={setSelectionConfigurations}
            viewType={viewType}
            isRootSelectable={isRootSelectable}
            space={space}
            selectionMode={selectionMode}
          />
        );
      }}
    />
  );
};
