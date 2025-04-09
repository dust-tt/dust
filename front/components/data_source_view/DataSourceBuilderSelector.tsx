import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Label,
  Spinner,
} from "@dust-tt/sparkle";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";

import { DataSourceTableSelector } from "@app/components/data_source_view/DataSourceTableSelector";
import { useSpaces } from "@app/lib/swr/spaces";
import type {
  ContentNodesViewType,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";

interface DataSourceBuilderSelectorProps {
  allowedSpaces?: SpaceType[];
  owner: LightWorkspaceType;
  dataSourceViews: DataSourceViewType[];
  selectionConfigurations: DataSourceViewSelectionConfigurations;
  setSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  >;
  viewType: ContentNodesViewType;
  isRootSelectable: boolean;
}

export const DataSourceBuilderSelector = ({
  allowedSpaces,
  dataSourceViews,
  owner,
  selectionConfigurations,
  setSelectionConfigurations,
  viewType,
  isRootSelectable,
}: DataSourceBuilderSelectorProps) => {
  const { spaces, isSpacesLoading } = useSpaces({ workspaceId: owner.sId });
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);

  // Filter spaces to only those with data source views
  const filteredSpaces = useMemo(() => {
    const spaceIds = new Set(dataSourceViews.map((dsv) => dsv.spaceId));
    return spaces.filter((s) => spaceIds.has(s.sId));
  }, [spaces, dataSourceViews]);

  useEffect(() => {
    if (filteredSpaces.length > 0 && !selectedSpaceId) {
      const firstKey = Object.keys(selectionConfigurations)[0] ?? null;
      const defaultSpaceId = firstKey
        ? selectionConfigurations[firstKey]?.dataSourceView?.spaceId ?? null
        : null;

      setSelectedSpaceId(defaultSpaceId || filteredSpaces[0].sId);
    }
  }, [filteredSpaces, selectionConfigurations, selectedSpaceId]);

  const selectedSpace = useMemo(() => {
    return filteredSpaces.find((s) => s.sId === selectedSpaceId);
  }, [filteredSpaces, selectedSpaceId]);

  if (isSpacesLoading) {
    return <Spinner />;
  }

  // Handle case with no spaces or data sources
  if (filteredSpaces.length === 0) {
    return <div>No spaces with data sources available.</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">Space:</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              label={selectedSpace?.name || "Select space"}
              variant="outline"
              size="xs"
              isSelect
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup
              value={selectedSpaceId || ""}
              onValueChange={setSelectedSpaceId}
            >
              {filteredSpaces.map((space) => (
                <DropdownMenuRadioItem
                  key={space.sId}
                  value={space.sId}
                  label={space.name}
                  disabled={!allowedSpaces?.some((s) => s.sId === space.sId)}
                />
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {selectedSpace && (
        <DataSourceTableSelector
          owner={owner}
          dataSourceViews={dataSourceViews.filter(
            (dsv) => dsv.spaceId === selectedSpace.sId
          )}
          selectionConfigurations={selectionConfigurations}
          setSelectionConfigurations={setSelectionConfigurations}
          viewType={viewType}
          isRootSelectable={isRootSelectable}
          space={selectedSpace}
        />
      )}
    </div>
  );
};
