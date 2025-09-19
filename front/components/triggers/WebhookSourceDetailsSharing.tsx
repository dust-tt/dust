import {
  DataTable,
  Page,
  ScrollArea,
  SearchInput,
  SliderToggle,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import {
  useAddWebhookSourceViewToSpace,
  useRemoveWebhookSourceViewFromSpace,
} from "@app/lib/swr/webhook_source";
import type { LightWorkspaceType } from "@app/types";
import type { SpaceType } from "@app/types/space";
import type {
  WebhookSourceType,
  WebhookSourceViewType,
  WebhookSourceWithViews,
} from "@app/types/triggers/webhooks";

type WebhookSourceDetailsSharingProps = {
  webhookSource: WebhookSourceWithViews;
  owner: LightWorkspaceType;
};

type RowData = {
  name: string;
  space: SpaceType;
  webhookSourceView: WebhookSourceViewType | undefined;
  onClick: () => void;
};

const ActionCell = ({
  webhookSource,
  webhookSourceView,
  space,
  addToSpace,
  removeFromSpace,
}: {
  webhookSource: WebhookSourceType;
  webhookSourceView?: WebhookSourceViewType;
  space: SpaceType;
  addToSpace: ({
    space,
    webhookSource,
  }: {
    space: SpaceType;
    webhookSource: WebhookSourceType;
  }) => Promise<void>;
  removeFromSpace: (params: {
    webhookSourceView: WebhookSourceViewType;
    space: SpaceType;
  }) => Promise<void>;
}) => {
  const [loading, setLoading] = useState(false);

  return (
    <DataTable.CellContent>
      <SliderToggle
        disabled={loading}
        selected={webhookSourceView !== undefined}
        onClick={async () => {
          setLoading(true);
          if (webhookSourceView) {
            await removeFromSpace({ webhookSourceView, space });
          } else {
            await addToSpace({ space, webhookSource });
          }
          setLoading(false);
        }}
      />
    </DataTable.CellContent>
  );
};

export function WebhookSourceDetailsSharing({
  webhookSource,
  owner,
}: WebhookSourceDetailsSharingProps) {
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: false,
  });

  const globalSpace = spaces.find((space) => space.kind === "global") ?? null;
  const webhookSourceViewsWithSpace = webhookSource.views.map((view) => ({
    ...view,
    space: spaces.find((space) => space.sId === view.spaceId) ?? null,
  }));
  const globalView =
    webhookSourceViewsWithSpace.find((view) => view.space?.kind === "global") ??
    null;
  const isRestricted = globalView === null;

  const { addToSpace } = useAddWebhookSourceViewToSpace({
    owner,
  });
  const { removeFromSpace } = useRemoveWebhookSourceViewFromSpace({
    owner,
  });

  const availableSpaces = (spaces ?? []).filter((s) => s.kind === "regular");

  const rows: RowData[] = availableSpaces
    .map((space) => ({
      name: space.name,
      space: space,
      webhookSourceView: webhookSource.views.find(
        (view) => view.spaceId === space.sId
      ),
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
          webhookSource={webhookSource}
          addToSpace={addToSpace}
          removeFromSpace={removeFromSpace}
          webhookSourceView={info.row.original.webhookSourceView}
          space={info.row.original.space}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="mb-2 flex w-full flex-col gap-y-2 pt-2">
        <div className="flex w-full items-center justify-between overflow-visible">
          <Page.SectionHeader title="Available to all Spaces" />
          <SliderToggle
            disabled={loading}
            selected={!isRestricted}
            onClick={async () => {
              if (globalSpace !== null) {
                setLoading(true);
                if (!isRestricted) {
                  await removeFromSpace({
                    webhookSourceView: globalView,
                    space: globalSpace,
                  });
                } else {
                  await addToSpace({ space: globalSpace, webhookSource });
                }
                setLoading(false);
              }
            }}
          />
        </div>
      </div>
      <div className="text-foreground dark:text-foreground-night">
        {isRestricted ? (
          <>
            These tools are only available to the users of the selected spaces:
          </>
        ) : (
          <>These tools are accessible to everyone in the workspace.</>
        )}
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
