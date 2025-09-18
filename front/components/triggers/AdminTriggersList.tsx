import {
  Button,
  classNames,
  DataTable,
  EmptyCTA,
  PlusIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";

import { TRIGGER_BUTTONS_CONTAINER_ID } from "@app/components/spaces/SpacePageHeaders";
import { CreateWebhookSourceDialog } from "@app/components/triggers/CreateWebhookSourceDialog";
import { useActionButtonsPortal } from "@app/hooks/useActionButtonsPortal";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { filterWebhookSource } from "@app/lib/webhookSource";
import type { LightWorkspaceType, SpaceType } from "@app/types";
import { ANONYMOUS_USER_IMAGE_URL } from "@app/types";
import type {
  WebhookSourceViewType,
  WebhookSourceWithViews,
} from "@app/types/triggers/webhooks";

type RowData = {
  webhookSourceWithViews: WebhookSourceWithViews;
  webhookSourceSystemView: WebhookSourceViewType | null;
  spaces: SpaceType[];
  onClick?: () => void;
};

const NameCell = ({ row }: { row: RowData }) => {
  const { webhookSourceWithViews, webhookSourceSystemView } = row;

  return (
    <DataTable.CellContent grow>
      <div
        className={classNames(
          "flex flex-row items-center gap-3 py-3",
          webhookSourceSystemView ? "" : "opacity-50"
        )}
      >
        <div className="flex flex-grow flex-col gap-0 overflow-hidden truncate">
          <div className="truncate text-sm font-semibold text-foreground dark:text-foreground-night">
            {webhookSourceSystemView?.customName ?? webhookSourceWithViews.name}
          </div>
        </div>
      </div>
    </DataTable.CellContent>
  );
};

type AdminTriggersListProps = {
  owner: LightWorkspaceType;
  systemSpace: SpaceType;
  setSelectedWebhookSourceView: Dispatch<
    SetStateAction<WebhookSourceViewType | null>
  >;
  isWebhookSourcesWithViewsLoading: boolean;
  webhookSourcesWithViews: WebhookSourceWithViews[];
  filter: string;
};

export const AdminTriggersList = ({
  owner,
  systemSpace,
  setSelectedWebhookSourceView,
  isWebhookSourcesWithViewsLoading,
  webhookSourcesWithViews,
  filter,
}: AdminTriggersListProps) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: false,
  });
  const { portalToHeader } = useActionButtonsPortal({
    containerId: TRIGGER_BUTTONS_CONTAINER_ID,
  });

  const rows: RowData[] = useMemo(
    () =>
      webhookSourcesWithViews.map((webhookSourceWithViews) => {
        const webhookSourceSystemView =
          webhookSourceWithViews.views.find(
            (view) => view.spaceId === systemSpace?.sId
          ) ?? null;
        const spaceIds =
          webhookSourceWithViews?.views.map((view) => view.spaceId) ?? [];

        const onClick =
          webhookSourceSystemView !== null
            ? () => {
                setSelectedWebhookSourceView(webhookSourceSystemView);
              }
            : undefined;

        return {
          webhookSourceWithViews,
          webhookSourceSystemView,
          spaces: spaces.filter((space) => spaceIds?.includes(space.sId)),
          onClick,
        };
      }),
    [
      webhookSourcesWithViews,
      spaces,
      systemSpace?.sId,
      setSelectedWebhookSourceView,
    ]
  );
  const columns = useMemo((): ColumnDef<RowData>[] => {
    const columns: ColumnDef<RowData, any>[] = [];

    columns.push(
      {
        id: "name",
        accessorKey: "name",
        header: "Name",
        cell: (info: CellContext<RowData, string>) => (
          <NameCell row={info.row.original} />
        ),
        filterFn: (row, id, filterValue) =>
          filterWebhookSource(row.original.webhookSourceWithViews, filterValue),
        sortingFn: (rowA, rowB) => {
          return rowA.original.webhookSourceWithViews.name.localeCompare(
            rowB.original.webhookSourceWithViews.name
          );
        },
      },
      {
        id: "access",
        accessorKey: "spaces",
        header: "Access",
        cell: (info: CellContext<RowData, SpaceType[]>) => {
          const globalSpace = info.getValue().find((s) => s.kind === "global");
          const accessibleTo = globalSpace
            ? "Everyone"
            : info
                .getValue()
                .filter((s) => s.kind === "regular")
                .map((s) => s.name)
                .join(", ");

          return (
            <DataTable.CellContent>
              <div className="flex items-center gap-2">{accessibleTo}</div>
            </DataTable.CellContent>
          );
        },
        sortingFn: (rowA, rowB) => {
          return rowA.original.webhookSourceWithViews.name.localeCompare(
            rowB.original.webhookSourceWithViews.name
          );
        },
        meta: {
          className: "w-28",
        },
      },
      {
        id: "by",
        accessorKey: "webhookSourceView.editedByUser",
        header: "By",
        cell: (info) => {
          const editedByUser =
            info.row.original.webhookSourceSystemView?.editedByUser;

          return (
            <DataTable.CellContent
              avatarUrl={editedByUser?.imageUrl ?? ANONYMOUS_USER_IMAGE_URL}
              avatarTooltipLabel={editedByUser?.fullName ?? undefined}
              roundedAvatar
            />
          );
        },
        meta: {
          className: "w-10",
        },
      },
      {
        id: "lastUpdated",
        accessorKey: "webhookSourceView.editedByUser.editedAt",
        header: "Last updated",
        cell: (info: CellContext<RowData, number>) => (
          <DataTable.BasicCellContent
            label={formatTimestampToFriendlyDate(
              info.row.original.webhookSourceWithViews.updatedAt,
              "long"
            )}
          />
        ),
        meta: {
          className: "w-64",
        },
      }
    );

    return columns;
  }, []);

  const CreateWebhookCTA = () => (
    <Button
      label="Create webhook source"
      variant="outline"
      icon={PlusIcon}
      size="sm"
      onClick={() => setIsCreateOpen(true)}
    />
  );

  if (isWebhookSourcesWithViewsLoading) {
    return (
      <div className="mt-16 flex justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <CreateWebhookSourceDialog
        isOpen={isCreateOpen}
        setIsOpen={setIsCreateOpen}
        owner={owner}
      />
      {rows.length === 0 ? (
        <EmptyCTA
          message="You don’t have any triggers yet."
          action={<CreateWebhookCTA />}
        />
      ) : (
        <>
          {portalToHeader(<CreateWebhookCTA />)}
          <DataTable
            data={rows}
            columns={columns}
            className="pb-4"
            filterColumn="name"
            filter={filter}
          />
        </>
      )}
    </>
  );
};
