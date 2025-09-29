import {
  DataTable,
  Page,
  ScrollArea,
  SearchInput,
  SliderToggle,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

import type { MCPServerFormValues } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import type { MCPServerType } from "@app/lib/api/mcp";
import type { SpaceType, WorkspaceType } from "@app/types";

type RowData = {
  name: string;
  space: SpaceType;
  isEnabled: boolean;
  onClick: () => void;
};

const ActionCell = ({
  isEnabled,
  onToggle,
}: {
  isEnabled: boolean;
  onToggle: () => void;
}) => {
  return (
    <DataTable.CellContent>
      <SliderToggle selected={isEnabled} onClick={onToggle} />
    </DataTable.CellContent>
  );
};

interface MCPServerDetailsSharingProps {
  mcpServer?: MCPServerType;
  owner: WorkspaceType;
  spaces: SpaceType[];
}

export function MCPServerDetailsSharing({
  spaces,
}: MCPServerDetailsSharingProps) {
  const form = useFormContext<MCPServerFormValues>();
  const sharingSettings = form.watch("sharingSettings") || {};

  const globalSpace = spaces.find((space) => space.kind === "global");
  const availableSpaces = spaces.filter((s) => s.kind === "regular");

  // Determine if currently restricted based on form state.
  const isRestricted = globalSpace ? !sharingSettings?.[globalSpace.sId] : true;

  const handleToggle = (space: SpaceType) => {
    const currentState = sharingSettings?.[space.sId] ?? false;
    form.setValue(`sharingSettings.${space.sId}`, !currentState, {
      shouldDirty: true,
    });
  };

  const rows: RowData[] = availableSpaces
    .map((space) => ({
      name: space.name,
      space: space,
      isEnabled: sharingSettings?.[space.sId] ?? false,
      onClick: () => handleToggle(space),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const columns: ColumnDef<RowData, any>[] = [
    {
      id: "name",
      header: "Name",
      accessorKey: "name",
    },
    {
      id: "action",
      header: "",
      accessorKey: "isEnabled",
      meta: {
        className: "w-14",
      },
      cell: (info: CellContext<RowData, boolean>) => (
        <ActionCell
          isEnabled={info.row.original.isEnabled}
          onToggle={info.row.original.onClick}
        />
      ),
    },
  ];

  const [filter, setFilter] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <div className="mb-2 flex w-full flex-col gap-y-2 pt-2">
        <div className="flex w-full items-center justify-between overflow-visible">
          <Page.SectionHeader title="Available to all Spaces" />
          <SliderToggle
            selected={!isRestricted}
            onClick={() => {
              if (globalSpace) {
                handleToggle(globalSpace);
              }
            }}
          />
        </div>

        <div className="text-foreground dark:text-foreground-night">
          {isRestricted ? (
            <>
              These tools are only available to the users of the selected
              spaces:
            </>
          ) : (
            <>These tools are accessible to everyone in the workspace.</>
          )}
        </div>
      </div>

      {isRestricted && (
        <>
          <div className="flex flex-row gap-2">
            <SearchInput
              name="filter"
              placeholder="Search a space"
              className="w-full"
              value={filter}
              onChange={(e) => setFilter(e)}
            />
          </div>

          <ScrollArea className="h-full">
            <DataTable
              data={rows}
              columns={columns}
              filter={filter}
              filterColumn="name"
            />
          </ScrollArea>
        </>
      )}
    </div>
  );
}
