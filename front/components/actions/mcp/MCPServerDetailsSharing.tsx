import {
  DataTable,
  Page,
  ScrollArea,
  SearchInput,
  SliderToggle,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

import type { MCPServerType, MCPServerViewType } from "@app/lib/api/mcp";
import {
  useAddMCPServerToSpace,
  useRemoveMCPServerViewFromSpace,
} from "@app/lib/swr/mcp_servers";
import { useMCPServers } from "@app/lib/swr/mcp_servers";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import type { LightWorkspaceType, SpaceType } from "@app/types";

type MCPServerDetailsSharingProps = {
  mcpServer: MCPServerType;
  owner: LightWorkspaceType;
};

type RowData = {
  name: string;
  space: SpaceType;
  serverView: MCPServerViewType | undefined;
  onClick: () => void;
};

const ActionCell = ({
  mcpServer,
  mcpServerView,
  space,
  owner,
}: {
  mcpServer: MCPServerType;
  mcpServerView?: MCPServerViewType;
  space: SpaceType;
  owner: LightWorkspaceType;
}) => {
  const { addToSpace } = useAddMCPServerToSpace(owner);
  const { removeFromSpace } = useRemoveMCPServerViewFromSpace(owner);
  const [loading, setLoading] = useState(false);
  return (
    <DataTable.CellContent>
      <SliderToggle
        disabled={loading}
        selected={mcpServerView !== undefined}
        onClick={async () => {
          setLoading(true);
          if (mcpServerView) {
            await removeFromSpace(mcpServerView, space);
          } else {
            await addToSpace(mcpServer, space);
          }
          setLoading(false);
        }}
      />
    </DataTable.CellContent>
  );
};

export function MCPServerDetailsSharing({
  mcpServer,
  owner,
}: MCPServerDetailsSharingProps) {
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: false,
  });
  const { mcpServers } = useMCPServers({
    owner,
  });
  const mcpServerWithViews = mcpServers.find((s) => s.sId === mcpServer.sId);
  const [loading, setLoading] = useState(false);

  const views =
    mcpServerWithViews?.views.map((v) => ({
      ...v,
      space: spaces.find((space) => space.sId === v.spaceId),
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    })) || [];

  const globalView = views.find((view) => view.space?.kind === "global");
  const globalSpace = spaces.find((space) => space.kind === "global");
  const isRestricted = !globalView;

  const availableSpaces = (spaces ?? []).filter((s) => s.kind === "regular");

  const { addToSpace } = useAddMCPServerToSpace(owner);
  const { removeFromSpace } = useRemoveMCPServerViewFromSpace(owner);

  const rows: RowData[] = availableSpaces
    .map((space) => ({
      name: space.name,
      space: space,
      serverView: views.find((view) => view.spaceId === space.sId),
      onClick: () => {},
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
      accessorKey: "viewId",
      meta: {
        className: "w-14",
      },
      cell: (info: CellContext<RowData, string>) => (
        <ActionCell
          mcpServer={mcpServer}
          mcpServerView={info.row.original.serverView}
          space={info.row.original.space}
          owner={owner}
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
            disabled={loading}
            selected={!isRestricted}
            onClick={async () => {
              if (globalSpace) {
                setLoading(true);
                if (!isRestricted) {
                  await removeFromSpace(globalView, globalSpace);
                } else {
                  await addToSpace(mcpServer, globalSpace);
                }
                setLoading(false);
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
