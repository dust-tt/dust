import { AgentEditBar } from "@app/components/assistant/AgentEditBar";
import { DeleteAgentDialog } from "@app/components/assistant/DeleteAgentDialog";
import { SCOPE_INFO } from "@app/components/assistant/details/AgentDetailsSheet";
import { GlobalAgentAction } from "@app/components/assistant/manager/GlobalAgentAction";
import { TableTagSelector } from "@app/components/assistant/manager/TableTagSelector";
import { assistantUsageMessage } from "@app/components/assistant/Usage";
import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { usePaginationFromUrl } from "@app/hooks/usePaginationFromUrl";
import { useAuth } from "@app/lib/auth/AuthContext";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { useAppRouter } from "@app/lib/platform";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { useTags } from "@app/lib/swr/tags";
import {
  classNames,
  formatTimestampToFriendlyDate,
  tagsSorter,
} from "@app/lib/utils";
import { hasHealthyProviders } from "@app/lib/utils/providersHealth";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import type {
  AgentConfigurationScope,
  AgentUsageType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import { getModelMaker } from "@app/types/assistant/models/providers";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { TagType } from "@app/types/tag";
import type { UserType, WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import type { MenuItem } from "@dust-tt/sparkle";
import {
  Avatar,
  Brackets,
  Checkbox,
  Chip,
  Clipboard,
  DataTable,
  Edit04,
  Eye,
  Label,
  Tooltip,
  Trash01,
} from "@dust-tt/sparkle";
import type { CellContext, HeaderContext } from "@tanstack/react-table";
import type { ComponentType, ReactNode } from "react";
import { useMemo, useState } from "react";

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
  model: string;
  modelIcon: ComponentType | undefined;
  onClick?: () => void;
  menuItems?: MenuItem[];
  agentTags: TagType[];
  agentTagsAsString: string;
  action?: ReactNode;
  canArchive: boolean;
  canEdit: boolean;
};

const getTableColumns = ({
  owner,
  tags,
  mutateAgentConfigurations,
}: {
  owner: WorkspaceType;
  tags: TagType[];
  mutateAgentConfigurations: () => Promise<any>;
}) => {
  /**
   * Columns order:
   * - Select
   * - Name (always)
   * - Model (hidden on mobile)
   * - Access (hidden on mobile)
   * - Editors (hidden on mobile)
   * - Tags (always)
   * - Usage (hidden on mobile)
   * - Feedback (hidden on mobile)
   * - Last Edited (hidden on mobile)
   * - Actions (always)
   */

  return [
    {
      header: (info: HeaderContext<RowData, boolean>) => {
        const areAllPageRowsSelected = info.table.getIsAllPageRowsSelected();
        const hasSelection = Object.values(
          info.table.getState().rowSelection
        ).some((isSelected) => isSelected);

        return (
          <DataTable.CellContent className="size-full items-center justify-center">
            <Checkbox
              checked={
                areAllPageRowsSelected ? true : hasSelection ? "partial" : false
              }
              disabled={
                !info.table.getRowModel().rows.some((row) => row.getCanSelect())
              }
              tooltip={
                areAllPageRowsSelected
                  ? "Clear selection"
                  : "Select all on page"
              }
              onClick={(e) => {
                e.stopPropagation();
              }}
              onCheckedChange={(checked) => {
                if (checked) {
                  info.table.toggleAllPageRowsSelected(true);
                } else {
                  // Unticking clears the whole selection across pages.
                  info.table.resetRowSelection();
                }
              }}
            />
          </DataTable.CellContent>
        );
      },
      accessorKey: "select",
      cell: (info: CellContext<RowData, boolean>) => {
        if (!info.row.getCanSelect()) {
          return null;
        }

        const checkboxId = `select-agent-${info.row.id}`;
        const agentName = info.row.original.name;

        return (
          // `stopPropagation` keeps the click from also reaching the row's `onClick`, which opens the
          // agent details panel
          <Label
            htmlFor={checkboxId}
            className="flex size-full cursor-pointer items-center justify-center hover:bg-muted-background"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Checkbox
              id={checkboxId}
              aria-label={
                info.row.getIsSelected()
                  ? `Deselect ${agentName}`
                  : `Select ${agentName}`
              }
              checked={info.row.getIsSelected()}
              onCheckedChange={(checked) => info.row.toggleSelected(!!checked)}
            />
          </Label>
        );
      },
      meta: {
        className: "w-10 p-0",
      },
      enableSorting: false,
    },
    {
      header: "Name",
      accessorKey: "name",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          <div className={classNames("flex flex-row items-center gap-2 py-3")}>
            <div>
              <Avatar visual={info.row.original.pictureUrl} size="sm" />
            </div>
            <div className="flex min-w-0 grow flex-col">
              <div className="heading-sm overflow-hidden truncate text-foreground">
                {info.getValue()}
              </div>
              <div className="overflow-hidden truncate text-sm text-muted-foreground">
                {info.row.original.description}
              </div>
            </div>
          </div>
        </DataTable.CellContent>
      ),
      meta: {
        className: "w-48 @lg:w-full",
      },
    },
    {
      header: "Model",
      accessorKey: "model",
      cell: (info: CellContext<RowData, string>) => {
        const modelName = info.getValue() || "-";
        const modelIcon = info.row.original.modelIcon;

        return (
          <Tooltip
            tooltipTriggerAsChild
            label={modelName}
            trigger={
              <div className="inline-flex">
                <DataTable.CellContent
                  icon={modelIcon}
                  iconClassName="mr-0 @xl:mr-2"
                >
                  <span className="hidden @xl:inline">{modelName}</span>
                  {!modelIcon && <span className="@xl:hidden">-</span>}
                </DataTable.CellContent>
              </div>
            }
          />
        );
      },
      meta: {
        className: "hidden @sm:w-20 @sm:table-cell @xl:w-48",
      },
    },
    {
      header: "Access",
      accessorKey: "scope",
      cell: (info: CellContext<RowData, AgentConfigurationScope>) => (
        <DataTable.CellContent>
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
        className: "hidden @lg:w-32 @lg:table-cell",
      },
    },
    {
      header: "Editors",
      accessorKey: "editors",
      cell: (info: CellContext<RowData, UserType[]>) => {
        const { editors } = info.row.original;

        if (!editors) {
          return <DataTable.BasicCellContent label="-" />;
        }

        return (
          <DataTable.CellContent
            avatarStack={{
              items: editors.map((editor) => ({
                name: editor.fullName,
                visual: editor.image,
                isRounded: true,
              })),
              nbVisibleItems: 4,
            }}
          />
        );
      },
      meta: {
        className: "hidden @lg:w-24 @lg:table-cell",
      },
    },
    {
      header: "Tags",
      accessorKey: "agentTagsAsString",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent
          grow
          className={classNames("flex flex-row items-center")}
        >
          <div className="group flex flex-row items-center gap-1">
            <div className="truncate text-muted-foreground">
              <Tooltip
                tooltipTriggerAsChild
                label={info.getValue()}
                trigger={<span>{info.getValue()}</span>}
              />
            </div>
            {info.row.original.canEdit && (
              <TableTagSelector
                tags={tags}
                agentTags={info.row.original.agentTags}
                agentConfigurationId={info.row.original.sId}
                owner={owner}
                onChange={mutateAgentConfigurations}
              />
            )}
          </div>
        </DataTable.CellContent>
      ),
      isFilterable: true,
      meta: {
        className: "hidden @lg:table-cell @lg:w-24 @xl:w-40",
        tooltip: "Tags",
      },
    },
    {
      header: "Usage",
      accessorFn: (row: RowData) => row.usage?.messageCount ?? 0,
      cell: (info: CellContext<RowData, AgentUsageType | undefined>) => (
        <DataTable.BasicCellContent
          className="font-mono"
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
              className="font-mono"
              tooltip={feedbacksCount}
              label={`${f.up + f.down}`}
            />
          );
        }
      },
      meta: {
        className: "hidden @lg:w-20 @lg:table-cell",
        tooltip: "Active users in the last 30 days",
      },
    },
    {
      header: "Last Edited",
      accessorKey: "lastUpdate",
      cell: (info: CellContext<RowData, number>) => (
        <DataTable.BasicCellContent
          tooltip={
            info.getValue()
              ? formatTimestampToFriendlyDate(info.getValue(), "long")
              : undefined
          }
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
            <DataTable.CellContent>
              {info.row.original.action}
            </DataTable.CellContent>
          );
        }
        return <DataTable.MoreButton menuItems={info.row.original.menuItems} />;
      },
      meta: {
        className: "hidden @md:table-cell @md:w-14",
      },
    },
  ];
};

type AssistantsTableProps = {
  owner: WorkspaceType;
  agents: LightAgentConfigurationType[];
  setDetailedAgentId: (sId: string) => void;
  handleToggleAgentStatus: (
    agent: LightAgentConfigurationType
  ) => Promise<void>;
  showDisabledFreeWorkspacePopup: string | null;
  setShowDisabledFreeWorkspacePopup: (s: string | null) => void;
  selection: string[];
  setSelection: (selection: string[]) => void;
  mutateAgentConfigurations: () => Promise<any>;
};

export function AssistantsTable({
  owner,
  agents,
  setDetailedAgentId,
  handleToggleAgentStatus,
  showDisabledFreeWorkspacePopup,
  setShowDisabledFreeWorkspacePopup,
  selection,
  setSelection,
  mutateAgentConfigurations,
}: AssistantsTableProps) {
  const { tags } = useTags({ owner });
  const sortedTags = useMemo(() => [...tags].sort(tagsSorter), [tags]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: mutateAgentConfigurations has an unstable identity but always mutates the same SWR cache key.
  const columns = useMemo(
    () =>
      getTableColumns({
        owner,
        tags: sortedTags,
        mutateAgentConfigurations,
      }),
    [owner, sortedTags]
  );

  const { isDark } = useTheme();

  const { providersHealth } = useAuth();
  const noHealthyProviders = !hasHealthyProviders(providersHealth);

  const { hasPermission } = useWorkspacePermissions();
  const canCreateAgent = hasPermission("create", "agent");

  const [showDeleteDialog, setShowDeleteDialog] = useState<{
    open: boolean;
    agentConfiguration: LightAgentConfigurationType | undefined;
  }>({
    open: false,
    agentConfiguration: undefined,
  });
  const router = useAppRouter();
  const { pagination, setPagination } = usePaginationFromUrl({});

  // The selection lives in the table state (and not in the rows) so that
  // selecting an agent does not change the rows, which would reset pagination.
  const rowSelection = useMemo(
    () => Object.fromEntries(selection.map((agentId) => [agentId, true])),
    [selection]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const rows: RowData[] = useMemo(
    () =>
      agents.map((agentConfiguration) => {
        // Editing an agent (settings, tags, archive) is reserved to its
        // editors and to workspace admins.
        const canEdit = agentConfiguration.canEdit || isAdmin(owner);
        const canArchive =
          canEdit &&
          agentConfiguration.status !== "archived" &&
          agentConfiguration.scope !== "global";

        const modelConfig = getSupportedModelConfig(agentConfiguration.model);

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
          model: modelConfig?.displayName ?? agentConfiguration.model.modelId,
          modelIcon: modelConfig
            ? getModelMakerLogo(getModelMaker(modelConfig), isDark)
            : undefined,
          agentTags: agentConfiguration.tags,
          agentTagsAsString:
            agentConfiguration.tags.length > 0
              ? agentConfiguration.tags.map((t) => t.name).join(", ")
              : "",
          canArchive,
          canEdit,
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
            setDetailedAgentId(agentConfiguration.sId);
          },
          menuItems:
            agentConfiguration.scope !== "global" &&
            agentConfiguration.status !== "archived"
              ? [
                  {
                    label: "Edit",
                    "data-gtm-label": "assistantEditButton",
                    "data-gtm-location": "assistantDetails",
                    icon: Edit04,
                    disabled: !canEdit || noHealthyProviders,
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
                    icon: Brackets,
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
                    icon: Eye,
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      setDetailedAgentId(agentConfiguration.sId);
                    },
                    kind: "item" as const,
                  },
                  {
                    label: "Duplicate (New)",
                    "data-gtm-label": "agentDuplicationButton",
                    "data-gtm-location": "agentDetails",
                    icon: Clipboard,
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
                    disabled: !canCreateAgent || noHealthyProviders,
                  },
                  {
                    label: "Archive",
                    "data-gtm-label": "assistantDeletionButton",
                    "data-gtm-location": "assistantDetails",
                    icon: Trash01,
                    disabled: !canEdit,
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
      setDetailedAgentId,
      setShowDisabledFreeWorkspacePopup,
      showDisabledFreeWorkspacePopup,
      isDark,
      canCreateAgent,
    ]
  );

  const selectionSet = useMemo(() => new Set(selection), [selection]);

  const selectableRowIds = useMemo(
    () => rows.filter((row) => row.canArchive).map((row) => row.sId),
    [rows]
  );
  const totalSelectableCount = selectableRowIds.length;

  // Selection only ever contains selectable rows (only those render a
  // checkbox), so no extra filtering is needed here.
  const selectedAgents = useMemo(
    () => agents.filter((a) => selectionSet.has(a.sId)),
    [agents, selectionSet]
  );

  const pageRows = useMemo(() => {
    const start = pagination.pageIndex * pagination.pageSize;
    return rows.slice(start, start + pagination.pageSize);
  }, [rows, pagination]);
  const pageSelectedCount = useMemo(
    () =>
      pageRows.filter((row) => row.canArchive && selectionSet.has(row.sId))
        .length,
    [pageRows, selectionSet]
  );

  return (
    <>
      <DeleteAgentDialog
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
      <AgentEditBar
        owner={owner}
        selectedAgents={selectedAgents}
        tags={sortedTags}
        mutateAgentConfigurations={mutateAgentConfigurations}
        pageSelectedCount={pageSelectedCount}
        totalCount={totalSelectableCount}
        onClear={() => setSelection([])}
        onSelectAll={() => setSelection(selectableRowIds)}
      />
      <div>
        {rows.length > 0 && (
          <DataTable
            className="relative"
            data={rows}
            columns={columns}
            pagination={pagination}
            setPagination={setPagination}
            getRowId={(row) => row.sId}
            enableRowSelection={(row) => row.original.canArchive}
            disableRowClickSelection
            rowSelection={rowSelection}
            setRowSelection={(newRowSelection) => {
              setSelection(
                Object.keys(newRowSelection).filter(
                  (agentId) => newRowSelection[agentId]
                )
              );
            }}
          />
        )}
      </div>
    </>
  );
}
