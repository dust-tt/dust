import type { MenuItem } from "@dust-tt/sparkle";
import {
  Avatar,
  BracesIcon,
  Checkbox,
  Chip,
  ClipboardIcon,
  DataTable,
  EyeIcon,
  PencilSquareIcon,
  Tooltip,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { CellContext } from "@tanstack/react-table";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { DeleteAssistantDialog } from "@app/components/assistant/DeleteAssistantDialog";
import { SCOPE_INFO } from "@app/components/assistant/details/AssistantDetails";
import { GlobalAgentAction } from "@app/components/assistant/manager/GlobalAgentAction";
import { TableTagSelector } from "@app/components/assistant/manager/TableTagSelector";
import { assistantUsageMessage } from "@app/components/assistant/Usage";
import { usePaginationFromUrl } from "@app/hooks/usePaginationFromUrl";
import { useTags } from "@app/lib/swr/tags";
import {
  classNames,
  formatTimestampToFriendlyDate,
  tagsSorter,
} from "@app/lib/utils";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import type {
  AgentConfigurationScope,
  AgentUsageType,
  LightAgentConfigurationType,
  WorkspaceType,
} from "@app/types";
import { isAdmin, pluralize } from "@app/types";
import type { TagType } from "@app/types/tag";
import type { UserType } from "@app/types/user";

type RowData = {
  sId: string;
  name: string;
  description: string;
  pictureUrl: string;
  editors: UserType[];
  usage: AgentUsageType | undefined;
  feedbacks: { up: number; down: number } | undefined;
  lastUpdate: string | null;
  scope: AgentConfigurationScope;
  onClick?: () => void;
  menuItems?: MenuItem[];
  agentTags: TagType[];
  agentTagsAsString: string;
  action?: ReactNode;
  isSelected: boolean;
  canArchive: boolean;
};

// We disable the global agents in batch mode edit since they cannot be archived.
function isDisabled(canArchive: boolean, isBatchEdit: boolean): boolean {
  return !canArchive && isBatchEdit;
}

const getTableColumns = ({
  owner,
  tags,
  isBatchEdit,
  mutateAgentConfigurations,
}: {
  owner: WorkspaceType;
  tags: TagType[];
  isBatchEdit: boolean;
  mutateAgentConfigurations: () => Promise<any>;
}) => {
  /**
   * Columns order:
   * - Select (if batch edit)
   * - Name (always)
   * - Access (hidden on mobile)
   * - Editors (hidden on mobile)
   * - Tags (always)
   * - Usage (hidden on mobile)
   * - Feedback (hidden on mobile)
   * - Last Edited (hidden on mobile)
   * - Actions (always)
   */

  return [
    ...(isBatchEdit
      ? [
          {
            header: "",
            accessorKey: "select",
            cell: (info: CellContext<RowData, boolean>) => (
              <DataTable.CellContent
                disabled={isDisabled(info.row.original.canArchive, isBatchEdit)}
              >
                <Checkbox
                  checked={info.row.original.isSelected}
                  disabled={!info.row.original.canArchive}
                />
              </DataTable.CellContent>
            ),
            meta: {
              className: "w-8",
              tooltip: "Select",
            },
            sortable: false,
          },
        ]
      : []),
    {
      header: "Name",
      accessorKey: "name",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent
          disabled={isDisabled(info.row.original.canArchive, isBatchEdit)}
        >
          <div className={classNames("flex flex-row items-center gap-2 py-3")}>
            <div>
              <Avatar visual={info.row.original.pictureUrl} size="sm" />
            </div>
            <div className="flex min-w-0 grow flex-col">
              <div className="overflow-hidden truncate text-sm font-semibold text-foreground dark:text-foreground-night">
                {`@${info.getValue()}`}
              </div>
              <div className="overflow-hidden truncate text-sm text-muted-foreground dark:text-muted-foreground-night">
                {info.row.original.description}
              </div>
            </div>
          </div>
        </DataTable.CellContent>
      ),
      meta: {
        className: "w-40 @lg:w-full",
      },
    },
    {
      header: "Access",
      accessorKey: "scope",
      cell: (info: CellContext<RowData, AgentConfigurationScope>) => (
        <DataTable.CellContent
          disabled={isDisabled(info.row.original.canArchive, isBatchEdit)}
        >
          {info.getValue() !== "hidden" && (
            <Chip
              size="xs"
              label={SCOPE_INFO[info.getValue()].shortLabel}
              color={SCOPE_INFO[info.getValue()].color}
              icon={SCOPE_INFO[info.getValue()].icon}
            />
          )}
        </DataTable.CellContent>
      ),
      meta: {
        className: "hidden @sm:w-32 @sm:table-cell",
      },
    },
    {
      header: "Editors",
      accessorKey: "editors",
      cell: (info: CellContext<RowData, UserType[]>) => {
        const { editors } = info.row.original;

        if (!editors) {
          return (
            <DataTable.BasicCellContent
              disabled={isDisabled(info.row.original.canArchive, isBatchEdit)}
              label="-"
            />
          );
        }

        return (
          <DataTable.CellContent
            disabled={isDisabled(info.row.original.canArchive, isBatchEdit)}
          >
            <Avatar.Stack
              avatars={editors.map((editor) => ({
                name: editor.fullName,
                visual: editor.image,
              }))}
              nbVisibleItems={4}
              size="xs"
              isRounded
            />
          </DataTable.CellContent>
        );
      },
      meta: {
        className: "hidden @sm:w-32 @sm:table-cell",
      },
    },
    {
      header: "Tags",
      accessorKey: "agentTagsAsString",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent
          grow
          className={classNames("flex flex-row items-center")}
          disabled={isDisabled(info.row.original.canArchive, isBatchEdit)}
        >
          <div className="group flex flex-row items-center gap-1">
            <div className="truncate text-muted-foreground dark:text-muted-foreground-night">
              <Tooltip
                tooltipTriggerAsChild
                label={info.getValue()}
                trigger={<span>{info.getValue()}</span>}
              />
            </div>
            <TableTagSelector
              tags={tags}
              agentTags={info.row.original.agentTags}
              agentConfigurationId={info.row.original.sId}
              owner={owner}
              onChange={mutateAgentConfigurations}
            />
          </div>
        </DataTable.CellContent>
      ),
      isFilterable: true,
      meta: {
        className: "w-32 xl:w-60",
        tooltip: "Tags",
      },
    },
    {
      header: "Usage",
      accessorFn: (row: RowData) => row.usage?.messageCount ?? 0,
      cell: (info: CellContext<RowData, AgentUsageType | undefined>) => (
        <DataTable.BasicCellContent
          className={classNames("font-semibold")}
          disabled={isDisabled(info.row.original.canArchive, isBatchEdit)}
          tooltip={assistantUsageMessage({
            assistantName: info.row.original.name,
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            usage: info.row.original.usage || null,
            isLoading: false,
            isError: false,
            shortVersion: true,
            asString: true,
          })}
          label={info.row.original.usage?.messageCount ?? 0}
        />
      ),
      meta: {
        className: "hidden @sm:w-16 @sm:table-cell",
        tooltip: "Messages in the last 30 days",
      },
    },
    {
      header: "Feedback",
      accessorFn: (row: RowData) =>
        (row.feedbacks?.down ?? 0) + (row.feedbacks?.up ?? 0),
      cell: (info: CellContext<RowData, { up: number; down: number }>) => {
        if (info.row.original.scope === "global") {
          return "-";
        }
        const f = info.row.original.feedbacks;
        if (f) {
          const feedbacksCount = `${f.up + f.down} feedback${pluralize(f.up + f.down)} over the last 30 days`;
          return (
            <DataTable.BasicCellContent
              className={classNames("font-semibold")}
              disabled={isDisabled(info.row.original.canArchive, isBatchEdit)}
              tooltip={feedbacksCount}
              label={`${f.up + f.down}`}
            />
          );
        }
      },
      meta: {
        className: "hidden @sm:w-20 @sm:table-cell",
        tooltip: "Active users in the last 30 days",
      },
    },
    {
      header: "Last Edited",
      accessorKey: "lastUpdate",
      cell: (info: CellContext<RowData, number>) => (
        <DataTable.BasicCellContent
          disabled={isDisabled(info.row.original.canArchive, isBatchEdit)}
          tooltip={formatTimestampToFriendlyDate(info.getValue(), "long")}
          label={
            info.getValue()
              ? formatTimestampToFriendlyDate(info.getValue(), "compact")
              : "-"
          }
        />
      ),
      meta: { className: "hidden @sm:w-32 @sm:table-cell" },
    },
    {
      header: "",
      accessorKey: "actions",
      cell: (info: CellContext<RowData, number>) => {
        if (info.row.original.scope === "global") {
          return (
            <DataTable.CellContent
              disabled={isDisabled(info.row.original.canArchive, isBatchEdit)}
            >
              {info.row.original.action}
            </DataTable.CellContent>
          );
        }
        return (
          <DataTable.MoreButton
            menuItems={info.row.original.menuItems}
            disabled={isDisabled(info.row.original.canArchive, isBatchEdit)}
          />
        );
      },
      meta: {
        className: "w-14",
      },
    },
  ];
};

type AssistantsTableProps = {
  owner: WorkspaceType;
  agents: LightAgentConfigurationType[];
  setShowDetails: (agent: LightAgentConfigurationType) => void;
  handleToggleAgentStatus: (
    agent: LightAgentConfigurationType
  ) => Promise<void>;
  showDisabledFreeWorkspacePopup: string | null;
  setShowDisabledFreeWorkspacePopup: (s: string | null) => void;
  isBatchEdit: boolean;
  selection: string[];
  setSelection: (selection: string[]) => void;
  mutateAgentConfigurations: () => Promise<any>;
};

export function AssistantsTable({
  owner,
  agents,
  setShowDetails,
  handleToggleAgentStatus,
  showDisabledFreeWorkspacePopup,
  setShowDisabledFreeWorkspacePopup,
  isBatchEdit,
  selection,
  setSelection,
  mutateAgentConfigurations,
}: AssistantsTableProps) {
  const { tags } = useTags({ owner });
  const sortedTags = useMemo(() => [...tags].sort(tagsSorter), [tags]);

  const [showDeleteDialog, setShowDeleteDialog] = useState<{
    open: boolean;
    agentConfiguration: LightAgentConfigurationType | undefined;
  }>({
    open: false,
    agentConfiguration: undefined,
  });
  const router = useRouter();
  const { pagination, setPagination } = usePaginationFromUrl({});

  const rows: RowData[] = useMemo(
    () =>
      agents.map((agentConfiguration) => {
        const canArchive =
          (agentConfiguration.canEdit || isAdmin(owner)) &&
          agentConfiguration.status !== "archived" &&
          agentConfiguration.scope !== "global";

        return {
          sId: agentConfiguration.sId,
          name: agentConfiguration.name,
          usage: agentConfiguration.usage ?? {
            messageCount: 0,
            conversationCount: 0,
            userCount: 0,
            timePeriodSec: 30 * 24 * 60 * 60,
          },
          description: agentConfiguration.description,
          pictureUrl: agentConfiguration.pictureUrl,
          lastUpdate: agentConfiguration.versionCreatedAt,
          feedbacks: agentConfiguration.feedbacks,
          editors: agentConfiguration.editors ?? [],
          scope: agentConfiguration.scope,
          agentTags: agentConfiguration.tags,
          agentTagsAsString:
            agentConfiguration.tags.length > 0
              ? agentConfiguration.tags.map((t) => t.name).join(", ")
              : "",
          isSelected: selection.includes(agentConfiguration.sId),
          canArchive,
          action:
            agentConfiguration.scope === "global" ? (
              <GlobalAgentAction
                agent={agentConfiguration}
                owner={owner}
                handleToggleAgentStatus={handleToggleAgentStatus}
                showDisabledFreeWorkspacePopup={showDisabledFreeWorkspacePopup}
                setShowDisabledFreeWorkspacePopup={
                  setShowDisabledFreeWorkspacePopup
                }
              />
            ) : undefined,
          onClick: () => {
            if (isBatchEdit) {
              if (canArchive) {
                setSelection(
                  selection.includes(agentConfiguration.sId)
                    ? selection.filter((s) => s !== agentConfiguration.sId)
                    : [...selection, agentConfiguration.sId]
                );
              }
            } else {
              setShowDetails(agentConfiguration);
            }
          },
          menuItems:
            agentConfiguration.scope !== "global" &&
            agentConfiguration.status !== "archived"
              ? [
                  {
                    label: "Edit",
                    "data-gtm-label": "assistantEditButton",
                    "data-gtm-location": "assistantDetails",
                    icon: PencilSquareIcon,
                    disabled: !agentConfiguration.canEdit && !isAdmin(owner),
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      void router.push(
                        getAgentBuilderRoute(owner.sId, agentConfiguration.sId)
                      );
                    },
                    kind: "item" as const,
                  },
                  {
                    label: "Copy agent ID",
                    "data-gtm-label": "assistantCopyButton",
                    "data-gtm-location": "assistantDetails",
                    icon: BracesIcon,
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      void navigator.clipboard.writeText(
                        agentConfiguration.sId
                      );
                    },
                    kind: "item" as const,
                  },
                  {
                    label: "More info",
                    "data-gtm-label": "assistantMoreInfoButton",
                    "data-gtm-location": "assistantDetails",
                    icon: EyeIcon,
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      setShowDetails(agentConfiguration);
                    },
                    kind: "item" as const,
                  },
                  {
                    label: "Duplicate (New)",
                    "data-gtm-label": "assistantDuplicationButton",
                    "data-gtm-location": "assistantDetails",
                    icon: ClipboardIcon,
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      void router.push(
                        getAgentBuilderRoute(
                          owner.sId,
                          "new",
                          `duplicate=${agentConfiguration.sId}`
                        )
                      );
                    },
                    kind: "item" as const,
                  },
                  {
                    label: "Archive",
                    "data-gtm-label": "assistantDeletionButton",
                    "data-gtm-location": "assistantDetails",
                    icon: TrashIcon,
                    disabled: !agentConfiguration.canEdit && !isAdmin(owner),
                    variant: "warning" as const,
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      setShowDeleteDialog({ open: true, agentConfiguration });
                    },
                    kind: "item" as const,
                  },
                ].filter((item) => !item.disabled)
              : [],
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleToggleAgentStatus & router are not stable, mutating the agents list which prevent pagination to work
    [
      agents,
      owner,
      setShowDetails,
      setShowDisabledFreeWorkspacePopup,
      showDisabledFreeWorkspacePopup,
      selection,
      setSelection,
      isBatchEdit,
    ]
  );

  return (
    <>
      <DeleteAssistantDialog
        owner={owner}
        isOpen={showDeleteDialog.open}
        agentConfiguration={showDeleteDialog.agentConfiguration}
        onClose={() => {
          setShowDeleteDialog(({ agentConfiguration }) => ({
            open: false,
            agentConfiguration,
          }));
        }}
      />
      <div>
        {rows.length > 0 && (
          <DataTable
            className="relative"
            data={rows}
            columns={getTableColumns({
              owner,
              tags: sortedTags,
              isBatchEdit,
              mutateAgentConfigurations,
            })}
            pagination={pagination}
            setPagination={setPagination}
          />
        )}
      </div>
    </>
  );
}
