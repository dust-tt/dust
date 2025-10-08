import {
  Button,
  classNames,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyCTA,
  PlusIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { getAvatarFromIcon } from "@app/components/resources/resources_icons";
import { TRIGGER_BUTTONS_CONTAINER_ID } from "@app/components/spaces/SpacePageHeaders";
import { UsedByButton } from "@app/components/spaces/UsedByButton";
import type { WebhookSourceSheetMode } from "@app/components/triggers/WebhookSourceSheet";
import { WebhookSourceSheet } from "@app/components/triggers/WebhookSourceSheet";
import { useActionButtonsPortal } from "@app/hooks/useActionButtonsPortal";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { filterWebhookSource } from "@app/lib/webhookSource";
import type { LightWorkspaceType, SpaceType } from "@app/types";
import { ANONYMOUS_USER_IMAGE_URL } from "@app/types";
import type { WebhookSourceWithSystemViewAndUsage } from "@app/types/triggers/webhooks";
import {
  WEBHOOK_SOURCE_KIND,
  WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP,
} from "@app/types/triggers/webhooks";

type RowData = {
  webhookSource: WebhookSourceWithSystemViewAndUsage;
  spaces: SpaceType[];
  onClick?: () => void;
};

const NameCell = ({ row }: { row: RowData }) => {
  const { webhookSource } = row;
  const systemView = webhookSource.systemView;
  return (
    <DataTable.CellContent grow>
      <div
        className={classNames(
          "flex flex-row items-center gap-3 py-3",
          webhookSource.systemView ? "" : "opacity-50"
        )}
      >
        {systemView && <div>{getAvatarFromIcon(systemView.icon, "sm")}</div>}
        <div className="flex flex-grow flex-col gap-0 overflow-hidden truncate">
          <div className="truncate text-sm font-semibold text-foreground dark:text-foreground-night">
            {systemView?.customName ?? webhookSource.name}
          </div>
          {systemView?.description && (
            <div className="truncate text-xs text-muted-foreground dark:text-muted-foreground-night">
              {systemView.description}
            </div>
          )}
        </div>
      </div>
    </DataTable.CellContent>
  );
};

interface AdminTriggersListProps {
  owner: LightWorkspaceType;
  isWebhookSourcesWithViewsLoading: boolean;
  webhookSourcesWithSystemView: WebhookSourceWithSystemViewAndUsage[];
  filter: string;
  setAgentSId: (a: string | null) => void;
}

export const AdminTriggersList = ({
  owner,
  isWebhookSourcesWithViewsLoading,
  webhookSourcesWithSystemView,
  filter,
  setAgentSId,
}: AdminTriggersListProps) => {
  const [sheetMode, setSheetMode] = useState<WebhookSourceSheetMode | null>(
    null
  );
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: false,
  });
  const { portalToHeader } = useActionButtonsPortal({
    containerId: TRIGGER_BUTTONS_CONTAINER_ID,
  });

  const rows: RowData[] = useMemo(
    () =>
      webhookSourcesWithSystemView.map((webhookSource) => {
        const spaceIds = webhookSource.views.map((view) => view.spaceId);

        const onClick = !webhookSource.systemView
          ? undefined
          : () => {
              setSheetMode({ type: "edit", webhookSource });
            };

        return {
          webhookSource,
          spaces: spaces.filter((space) => spaceIds?.includes(space.sId)),
          onClick,
        };
      }),
    [spaces, webhookSourcesWithSystemView]
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
        filterFn: (row, _id, filterValue) =>
          filterWebhookSource(row.original.webhookSource, filterValue),
        sortingFn: (rowA, rowB) => {
          return rowA.original.webhookSource.name.localeCompare(
            rowB.original.webhookSource.name
          );
        },
      },
      {
        header: "Used by",
        accessorFn: (row) => row.webhookSource.usage?.count ?? 0,
        cell: (info) => (
          <DataTable.CellContent>
            <UsedByButton
              usage={{
                count: info.row.original.webhookSource.usage?.count ?? 0,
                agents: info.row.original.webhookSource.usage?.agents ?? [],
              }}
              onItemClick={setAgentSId}
            />
          </DataTable.CellContent>
        ),
        meta: {
          className: "w-24",
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
          return rowA.original.webhookSource.name.localeCompare(
            rowB.original.webhookSource.name
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
            info.row.original.webhookSource.systemView?.editedByUser;

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
              info.row.original.webhookSource.updatedAt,
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
  }, [setAgentSId]);

  const CreateWebhookCTA = () => {
    const { hasFeature } = useFeatureFlags({
      workspaceId: owner.sId,
    });
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            label="Create webhook source"
            variant="outline"
            icon={PlusIcon}
            size="sm"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {WEBHOOK_SOURCE_KIND.filter((kind) => {
            const preset = WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[kind];
            return (
              preset.featureFlag === undefined || hasFeature(preset.featureFlag)
            );
          }).map((kind) => (
            <DropdownMenuItem
              key={kind}
              label={WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[kind].name}
              icon={WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[kind].icon}
              onClick={() => setSheetMode({ type: "create", kind })}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  if (isWebhookSourcesWithViewsLoading) {
    return (
      <div className="mt-16 flex justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <WebhookSourceSheet
        mode={sheetMode}
        onClose={() => {
          setSheetMode(null);
        }}
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
