import type { MenuItem } from "@dust-tt/sparkle";
import {
  AnthropicLogo,
  Avatar,
  Brackets,
  Checkbox,
  Chip,
  Clipboard,
  cn,
  DataTable,
  DeepseekLogo,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DustLogoSquare,
  Edit04,
  Eye,
  GeminiLogo,
  GrokLogo,
  MistralLogo,
  OpenaiLogo,
  SliderToggle,
  Tooltip,
  Trash01,
  Users01,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  HeaderContext,
  PaginationState,
} from "@tanstack/react-table";
import type { ComponentType, ReactNode } from "react";
import { useMemo, useState } from "react";

import type { FleetUsage } from "../../data/fleetUsage";
import type {
  AgentEditor,
  AgentScope,
  AgentTag,
  ManagedAgent,
  ModelMakerId,
} from "../../data/manageAgents";
import { AGENT_MODELS_BY_ID } from "../../data/manageAgents";
import { TableTagSelector } from "./TableTagSelector";
import { UsageCell } from "./UsageCell";
import { formatTimestampToFriendlyDate, pluralize } from "./utils";

export const SCOPE_INFO: Record<
  AgentScope,
  {
    shortLabel: string;
    label: string;
    color: "success" | "info" | "highlight" | "primary";
    icon?: typeof Users01 | undefined;
    text: string;
  }
> = {
  global: {
    shortLabel: "Default",
    label: "Default Agent",
    color: "primary",
    text: "Default agents provided by Dust.",
  },
  hidden: {
    shortLabel: "Not published",
    label: "Not published",
    color: "primary",
    text: "Hidden agents.",
  },
  visible: {
    shortLabel: "Published",
    label: "Published",
    color: "success",
    text: "Visible agents.",
  },
};

const MODEL_MAKER_LOGOS: Record<ModelMakerId, ComponentType> = {
  anthropic: AnthropicLogo,
  openai: OpenaiLogo,
  google_ai_studio: GeminiLogo,
  mistral: MistralLogo,
  deepseek: DeepseekLogo,
  xai: GrokLogo,
  noop: DustLogoSquare,
};

export function getModelLogoByModelId(
  modelId: string
): ComponentType | undefined {
  const model = AGENT_MODELS_BY_ID.get(modelId);
  return model ? MODEL_MAKER_LOGOS[model.maker] : undefined;
}

type RowData = {
  sId: string;
  name: string;
  description: string;
  emoji: string;
  backgroundColor: string;
  editors: AgentEditor[];
  usage: FleetUsage | undefined;
  feedbacks: { up: number; down: number } | undefined;
  lastUpdate: number | null;
  scope: AgentScope;
  model: string;
  modelIcon: ComponentType | undefined;
  onClick?: () => void;
  menuItems?: MenuItem[];
  agentTags: AgentTag[];
  agentTagsAsString: string;
  action?: ReactNode;
  canArchive: boolean;
  canEdit: boolean;
};

// Global agents (canArchive: false) cannot be edited, so we disable them in batch edit.
function isDisabled(canArchive: boolean, isBatchEdit: boolean): boolean {
  return !canArchive && isBatchEdit;
}

const getTableColumns = ({
  tags,
  isBatchEdit,
  onTagsChange,
  nowMs,
  showSelection,
}: {
  tags: AgentTag[];
  isBatchEdit: boolean;
  onTagsChange: (agentId: string, tags: AgentTag[]) => void;
  nowMs: number;
  // Omitted on tabs where nothing is selectable (Default, Archived), so those
  // lists don't carry a column of permanently disabled checkboxes.
  showSelection: boolean;
}) => {
  /**
   * Columns order:
   * - Select (if batch edit)
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
    ...(showSelection
      ? [
          {
            header: (info: HeaderContext<RowData, boolean>) => {
              const areAllPageRowsSelected =
                info.table.getIsAllPageRowsSelected();
              const hasSelection = Object.values(
                info.table.getState().rowSelection
              ).some((isSelected) => isSelected);

              return (
                <Checkbox
                  checked={
                    areAllPageRowsSelected
                      ? true
                      : hasSelection
                        ? "partial"
                        : false
                  }
                  disabled={
                    !info.table
                      .getRowModel()
                      .rows.some((row) => row.getCanSelect())
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
              );
            },
            accessorKey: "select",
            cell: (info: CellContext<RowData, boolean>) => (
              <DataTable.CellContent
                disabled={isDisabled(info.row.original.canArchive, isBatchEdit)}
              >
                <Checkbox
                  checked={info.row.getIsSelected()}
                  disabled={!info.row.getCanSelect()}
                  // Ticking a row must not also open the details sheet.
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={(state) => {
                    if (state !== "indeterminate") {
                      info.row.toggleSelected(state);
                    }
                  }}
                />
              </DataTable.CellContent>
            ),
            meta: {
              className: "w-10",
            },
            enableSorting: false,
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
          <div className={cn("flex flex-row items-center gap-2 py-3")}>
            <div>
              <Avatar
                emoji={info.row.original.emoji}
                backgroundColor={info.row.original.backgroundColor}
                size="sm"
              />
            </div>
            <div className="flex min-w-0 grow flex-col">
              <div className="heading-sm overflow-hidden truncate text-foreground">
                {`@${info.getValue()}`}
              </div>
              <div className="overflow-hidden truncate text-sm text-muted-foreground">
                {info.row.original.description}
              </div>
            </div>
          </div>
        </DataTable.CellContent>
      ),
      meta: {
        className: "w-32 @lg:w-full",
      },
    },
    {
      header: "Model",
      accessorKey: "model",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent
          disabled={isDisabled(info.row.original.canArchive, isBatchEdit)}
          icon={info.row.original.modelIcon}
        >
          {info.getValue() || "-"}
        </DataTable.CellContent>
      ),
      meta: {
        className: "hidden @sm:w-48 @sm:table-cell",
      },
    },
    {
      header: "Access",
      accessorKey: "scope",
      cell: (info: CellContext<RowData, AgentScope>) => (
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
      cell: (info: CellContext<RowData, AgentEditor[]>) => {
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
        className: "hidden @sm:w-24 @sm:table-cell",
      },
    },
    {
      header: "Tags",
      accessorKey: "agentTagsAsString",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent
          grow
          className={cn("flex flex-row items-center")}
          disabled={isDisabled(info.row.original.canArchive, isBatchEdit)}
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
                onChange={(newTags) =>
                  onTagsChange(info.row.original.sId, newTags)
                }
              />
            )}
          </div>
        </DataTable.CellContent>
      ),
      isFilterable: true,
      meta: {
        className: "w-24 xl:w-40",
        tooltip: "Tags",
      },
    },
    {
      header: "Usage",
      // Sorting on the human count: programmatic traffic must not be able to
      // float an agent nobody actually talks to.
      accessorFn: (row: RowData) => row.usage?.human ?? 0,
      cell: (info: CellContext<RowData, number>) => (
        <DataTable.CellContent
          disabled={isDisabled(info.row.original.canArchive, isBatchEdit)}
        >
          <UsageCell
            usage={info.row.original.usage ?? null}
            nowMs={nowMs}
            disabled={isDisabled(info.row.original.canArchive, isBatchEdit)}
          />
        </DataTable.CellContent>
      ),
      meta: {
        className: "hidden @sm:w-24 @sm:table-cell",
        tooltip: "Human messages in the last 30 days",
      },
    },
    {
      header: "Feedback",
      accessorFn: (row: RowData) =>
        (row.feedbacks?.down ?? 0) + (row.feedbacks?.up ?? 0),
      cell: (info: CellContext<RowData, number>) => {
        if (info.row.original.scope === "global") {
          return "-";
        }
        const f = info.row.original.feedbacks;
        if (f) {
          const feedbacksCount = `${f.up + f.down} feedback${pluralize(f.up + f.down)} over the last 30 days`;
          return (
            <DataTable.BasicCellContent
              className="font-mono"
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

interface GlobalAgentActionProps {
  agent: ManagedAgent;
  onToggle: (agent: ManagedAgent) => void;
  showDisabledFreeWorkspacePopup: string | null;
  setShowDisabledFreeWorkspacePopup: (sId: string | null) => void;
}

function GlobalAgentAction({
  agent,
  onToggle,
  showDisabledFreeWorkspacePopup,
  setShowDisabledFreeWorkspacePopup,
}: GlobalAgentActionProps) {
  return (
    <>
      <SliderToggle
        onClick={(e) => {
          e.stopPropagation();
          onToggle(agent);
        }}
        selected={agent.status === "active"}
        disabled={agent.status === "disabled_missing_datasource"}
      />
      <div className="whitespace-normal" onClick={(e) => e.stopPropagation()}>
        <Dialog
          open={showDisabledFreeWorkspacePopup === agent.sId}
          onOpenChange={(open) => {
            if (!open) {
              setShowDisabledFreeWorkspacePopup(null);
            }
          }}
        >
          <DialogContent size="md">
            <DialogHeader hideButton={false}>
              <DialogTitle>Free plan</DialogTitle>
            </DialogHeader>
            <DialogContainer>
              {`@${agent.name} is only available on our paid plans.`}
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
                onClick: () => setShowDisabledFreeWorkspacePopup(null),
              }}
              rightButtonProps={{
                label: "Check Dust plans",
                variant: "primary",
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

interface ManageAgentsTableProps {
  agents: ManagedAgent[];
  tags: AgentTag[];
  nowMs: number;
  showSelection: boolean;
  setDetailedAgentId: (sId: string) => void;
  onToggleAgentStatus: (agent: ManagedAgent) => void;
  onTagsChange: (agentId: string, tags: AgentTag[]) => void;
  onArchiveAgent: (agent: ManagedAgent) => void;
  isBatchEdit: boolean;
  selection: string[];
  setSelection: (selection: string[]) => void;
}

export function ManageAgentsTable({
  agents,
  tags,
  nowMs,
  showSelection,
  setDetailedAgentId,
  onToggleAgentStatus,
  onTagsChange,
  onArchiveAgent,
  isBatchEdit,
  selection,
  setSelection,
}: ManageAgentsTableProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  const [showDisabledFreeWorkspacePopup, setShowDisabledFreeWorkspacePopup] =
    useState<string | null>(null);

  const columns = useMemo(
    () =>
      getTableColumns({
        tags,
        isBatchEdit,
        onTagsChange,
        nowMs,
        showSelection,
      }),
    [tags, isBatchEdit, onTagsChange, nowMs, showSelection]
  );

  // The selection lives in the table state (and not in the rows) so that
  // selecting an agent does not change the rows, which would reset pagination.
  const rowSelection = useMemo(
    () => Object.fromEntries(selection.map((agentId) => [agentId, true])),
    [selection]
  );

  const rows: RowData[] = useMemo(
    () =>
      agents.map((agent) => {
        const canEdit = agent.canEdit;
        const canArchive =
          agent.status !== "archived" && agent.scope !== "global";
        const model = AGENT_MODELS_BY_ID.get(agent.modelId);

        return {
          sId: agent.sId,
          name: agent.name,
          description: agent.description,
          emoji: agent.emoji,
          backgroundColor: agent.backgroundColor,
          usage: agent.usage,
          feedbacks: agent.feedbacks,
          editors: agent.editors,
          lastUpdate: agent.lastUpdate,
          scope: agent.scope,
          model: model?.displayName ?? agent.modelId,
          modelIcon: getModelLogoByModelId(agent.modelId),
          agentTags: agent.tags,
          agentTagsAsString:
            agent.tags.length > 0
              ? agent.tags.map((t) => t.name).join(", ")
              : "",
          canArchive,
          canEdit,
          action:
            agent.scope === "global" ? (
              <GlobalAgentAction
                agent={agent}
                onToggle={onToggleAgentStatus}
                showDisabledFreeWorkspacePopup={showDisabledFreeWorkspacePopup}
                setShowDisabledFreeWorkspacePopup={
                  setShowDisabledFreeWorkspacePopup
                }
              />
            ) : undefined,
          // In batch edit, row clicks toggle the selection, which the table
          // handles through `enableRowSelection`.
          onClick: isBatchEdit
            ? undefined
            : () => {
                setDetailedAgentId(agent.sId);
              },
          menuItems:
            agent.scope !== "global" && agent.status !== "archived"
              ? [
                  {
                    label: "Edit",
                    icon: Edit04,
                    disabled: !canEdit,
                    onClick: (e: React.MouseEvent) => e.stopPropagation(),
                    kind: "item" as const,
                  },
                  {
                    label: "Copy agent ID",
                    icon: Brackets,
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      void navigator.clipboard.writeText(agent.sId);
                    },
                    kind: "item" as const,
                  },
                  {
                    label: "More info",
                    icon: Eye,
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      setDetailedAgentId(agent.sId);
                    },
                    kind: "item" as const,
                  },
                  {
                    label: "Duplicate (New)",
                    icon: Clipboard,
                    onClick: (e: React.MouseEvent) => e.stopPropagation(),
                    kind: "item" as const,
                  },
                  {
                    label: "Archive",
                    icon: Trash01,
                    disabled: !canEdit,
                    variant: "warning" as const,
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      onArchiveAgent(agent);
                    },
                    kind: "item" as const,
                  },
                ].filter((item) => !item.disabled)
              : [],
        };
      }),
    [
      agents,
      isBatchEdit,
      onArchiveAgent,
      onToggleAgentStatus,
      setDetailedAgentId,
      showDisabledFreeWorkspacePopup,
    ]
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <div>
      <DataTable
        className="relative"
        data={rows}
        columns={columns}
        pagination={pagination}
        setPagination={setPagination}
        getRowId={(row) => row.sId}
        enableRowSelection={
          showSelection ? (row) => row.original.canArchive : false
        }
        disableRowClickSelection={!isBatchEdit}
        rowSelection={rowSelection}
        setRowSelection={(newRowSelection) => {
          setSelection(
            Object.keys(newRowSelection).filter(
              (agentId) => newRowSelection[agentId]
            )
          );
        }}
      />
    </div>
  );
}
