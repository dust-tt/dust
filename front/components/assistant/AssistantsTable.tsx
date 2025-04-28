import {
  Avatar,
  Button,
  ClipboardIcon,
  Cog6ToothIcon,
  DataTable,
  PencilSquareIcon,
  Popup,
  SliderToggle,
  Tooltip,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { CellContext } from "@tanstack/react-table";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";

import { DeleteAssistantDialog } from "@app/components/assistant/DeleteAssistantDialog";
import { assistantUsageMessage } from "@app/components/assistant/Usage";
import { classNames, formatTimestampToFriendlyDate } from "@app/lib/utils";
import type {
  AgentConfigurationScope,
  AgentUsageType,
  LightAgentConfigurationType,
  WorkspaceType,
} from "@app/types";
import { isBuilder, pluralize } from "@app/types";
import type { TagType } from "@app/types/tag";

type MoreMenuItem = {
  label: string;
  icon: React.ComponentType;
  onClick: (e: React.MouseEvent) => void;
  variant?: "warning" | "default";
  kind: "item";
};

type RowData = {
  name: string;
  description: string;
  pictureUrl: string;
  usage: AgentUsageType | undefined;
  feedbacks: { up: number; down: number } | undefined;
  lastUpdate: string | null;
  scope: AgentConfigurationScope;
  onClick?: () => void;
  moreMenuItems?: MoreMenuItem[];
  tags: TagType[];
  action?: React.ReactNode;
};

const getTableColumns = (tags: TagType[]) => {
  return [
    {
      header: "Name",
      accessorKey: "name",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          <div className={classNames("flex flex-row items-center gap-2 py-3")}>
            <div className="">
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
    },
    ...(tags.length > 0
      ? [
          {
            header: "Tags",
            accessorKey: "tags",
            cell: (info: CellContext<RowData, TagType[]>) => (
              <DataTable.CellContent>
                <Tooltip
                  label={
                    info.getValue().length > 0
                      ? info
                          .getValue()
                          .map((t) => t.name)
                          .join(", ")
                      : "-"
                  }
                  trigger={
                    info.getValue().length > 0
                      ? info
                          .getValue()
                          .map((t) => t.name)
                          .join(", ")
                      : "-"
                  }
                />
              </DataTable.CellContent>
            ),
            isFilterable: true,
            meta: {
              className: "w-32",
              tooltip: "Tags",
            },
          },
        ]
      : []),
    {
      header: "Usage",
      accessorKey: "usage.messageCount",
      cell: (info: CellContext<RowData, AgentUsageType | undefined>) => (
        <DataTable.BasicCellContent
          className="font-semibold"
          tooltip={assistantUsageMessage({
            assistantName: info.row.original.name,
            usage: info.row.original.usage || null,
            isLoading: false,
            isError: false,
            shortVersion: true,
            asString: true,
          })}
          label={info.row.original.usage?.messageCount ?? 0}
        />
      ),
      meta: { className: "w-16", tooltip: "Messages in the last 30 days" },
    },
    {
      header: "Feedbacks",
      accessorFn: (row: RowData) => row.feedbacks,
      cell: (info: CellContext<RowData, { up: number; down: number }>) => {
        if (info.row.original.scope === "global") {
          return "-";
        }
        const f = info.getValue();
        if (f) {
          const feedbacksCount = `${f.up + f.down} feedback${pluralize(f.up + f.down)} over the last 30 days`;
          return (
            <DataTable.BasicCellContent
              className="font-semibold"
              tooltip={feedbacksCount}
              label={`${f.up + f.down}`}
            />
          );
        }
      },
      meta: { className: "w-20", tooltip: "Active users in the last 30 days" },
    },
    {
      header: "Last Edited",
      accessorKey: "lastUpdate",
      cell: (info: CellContext<RowData, number>) => (
        <DataTable.BasicCellContent
          label={
            info.getValue()
              ? formatTimestampToFriendlyDate(info.getValue(), "short")
              : "-"
          }
        />
      ),
      meta: { className: "w-32" },
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
        return (
          <DataTable.MoreButton menuItems={info.row.original.moreMenuItems} />
        );
      },
      meta: {
        className: "w-14",
      },
    },
  ];
};

type GlobalAgentActionProps = {
  agent: LightAgentConfigurationType;
  owner: WorkspaceType;
  handleToggleAgentStatus: (
    agent: LightAgentConfigurationType
  ) => Promise<void>;
  showDisabledFreeWorkspacePopup: string | null;
  setShowDisabledFreeWorkspacePopup: (s: string | null) => void;
};

function GlobalAgentAction({
  agent,
  owner,
  handleToggleAgentStatus,
  showDisabledFreeWorkspacePopup,
  setShowDisabledFreeWorkspacePopup,
}: GlobalAgentActionProps) {
  const router = useRouter();
  if (agent.sId === "helper") {
    return null;
  }

  if (agent.sId === "dust") {
    return (
      <Button
        variant="outline"
        icon={Cog6ToothIcon}
        size="xs"
        disabled={!isBuilder(owner)}
        onClick={(e: Event) => {
          e.stopPropagation();
          void router.push(`/w/${owner.sId}/builder/assistants/dust`);
        }}
      />
    );
  }

  return (
    <>
      <SliderToggle
        size="xs"
        onClick={async (e) => {
          e.stopPropagation();
          await handleToggleAgentStatus(agent);
        }}
        selected={agent.status === "active"}
        disabled={
          !isBuilder(owner) || agent.status === "disabled_missing_datasource"
        }
      />
      <div className="whitespace-normal" onClick={(e) => e.stopPropagation()}>
        <Popup
          show={showDisabledFreeWorkspacePopup === agent.sId}
          className="absolute bottom-8 right-0"
          chipLabel={`Free plan`}
          description={`@${agent.name} is only available on our paid plans.`}
          buttonLabel="Check Dust plans"
          buttonClick={() => {
            void router.push(`/w/${owner.sId}/subscription`);
          }}
          onClose={() => {
            setShowDisabledFreeWorkspacePopup(null);
          }}
        />
      </div>
    </>
  );
}

type AgentsTableProps = {
  owner: WorkspaceType;
  agents: LightAgentConfigurationType[];
  tags: TagType[];
  setShowDetails: (agent: LightAgentConfigurationType) => void;
  handleToggleAgentStatus: (
    agent: LightAgentConfigurationType
  ) => Promise<void>;
  showDisabledFreeWorkspacePopup: string | null;
  setShowDisabledFreeWorkspacePopup: (s: string | null) => void;
};

export function AssistantsTable({
  owner,
  agents,
  tags,
  setShowDetails,
  handleToggleAgentStatus,
  showDisabledFreeWorkspacePopup,
  setShowDisabledFreeWorkspacePopup,
}: AgentsTableProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState<{
    open: boolean;
    agentConfiguration: LightAgentConfigurationType | undefined;
  }>({
    open: false,
    agentConfiguration: undefined,
  });
  const router = useRouter();
  const rows: RowData[] = useMemo(
    () =>
      agents.map((agentConfiguration) => {
        return {
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
          scope: agentConfiguration.scope,
          tags: agentConfiguration.tags,
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
            setShowDetails(agentConfiguration);
          },
          moreMenuItems:
            agentConfiguration.scope !== "global" &&
            agentConfiguration.status !== "archived"
              ? [
                  {
                    label: "Edit",
                    "data-gtm-label": "assistantEditButton",
                    "data-gtm-location": "assistantDetails",
                    icon: PencilSquareIcon,
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      void router.push(
                        `/w/${owner.sId}/builder/assistants/${
                          agentConfiguration.sId
                        }?flow=${
                          agentConfiguration.scope
                            ? "workspace_assistants"
                            : "personal_assistants"
                        }`
                      );
                    },
                    kind: "item",
                  },
                  {
                    label: "Copy agent ID",
                    "data-gtm-label": "assistantCopyButton",
                    "data-gtm-location": "assistantDetails",
                    icon: ClipboardIcon,
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      void navigator.clipboard.writeText(
                        agentConfiguration.sId
                      );
                    },
                    kind: "item",
                  },
                  {
                    label: "Duplicate (New)",
                    "data-gtm-label": "assistantDuplicationButton",
                    "data-gtm-location": "assistantDetails",
                    icon: ClipboardIcon,
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      void router.push(
                        `/w/${owner.sId}/builder/assistants/new?flow=personal_assistants&duplicate=${agentConfiguration.sId}`
                      );
                    },
                    kind: "item",
                  },
                  {
                    label: "Delete",
                    "data-gtm-label": "assistantDeletionButton",
                    "data-gtm-location": "assistantDetails",
                    icon: TrashIcon,
                    variant: "warning",
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      setShowDeleteDialog({ open: true, agentConfiguration });
                    },
                    kind: "item",
                  },
                ]
              : [],
        };
      }),
    [
      agents,
      handleToggleAgentStatus,
      owner,
      router,
      setShowDetails,
      setShowDisabledFreeWorkspacePopup,
      showDisabledFreeWorkspacePopup,
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
        isPrivateAssistant={
          showDeleteDialog.agentConfiguration?.scope === "private"
        }
      />
      <div>
        {rows.length > 0 && (
          <DataTable
            className="relative"
            data={rows}
            columns={getTableColumns(tags)}
          />
        )}
      </div>
    </>
  );
}
