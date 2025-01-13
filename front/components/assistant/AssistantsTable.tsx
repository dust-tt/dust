import {
  Avatar,
  Button,
  ClipboardIcon,
  Cog6ToothIcon,
  DataTable,
  HandThumbDownIcon,
  HandThumbUpIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  Popup,
  SliderToggle,
  Tooltip,
  TrashIcon,
  UserIcon,
} from "@dust-tt/sparkle";
import type {
  AgentConfigurationScope,
  AgentUsageType,
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { isBuilder, pluralize } from "@dust-tt/types";
import type { CellContext, Row } from "@tanstack/react-table";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";

import { DeleteAssistantDialog } from "@app/components/assistant/DeleteAssistantDialog";
import {
  assistantActiveUsersMessage,
  assistantUsageMessage,
} from "@app/components/assistant/Usage";
import { SCOPE_INFO } from "@app/components/assistant_builder/Sharing";
import { classNames, formatTimestampToFriendlyDate } from "@app/lib/utils";

export const ASSISTANT_MANAGER_TABS = [
  // default shown tab = earliest in this list with non-empty agents
  {
    label: "Edited by me",
    icon: UserIcon,
    id: "current_user",
    description: "Edited or created by you.",
  },
  {
    label: "Company",
    icon: SCOPE_INFO["workspace"].icon,
    id: "workspace",
    description: SCOPE_INFO["workspace"].text,
  },
  {
    label: "Shared",
    icon: SCOPE_INFO["published"].icon,
    id: "published",
    description: SCOPE_INFO["published"].text,
  },
  {
    id: "global",
    label: "Default Assistant",
    icon: SCOPE_INFO["global"].icon,
    description: SCOPE_INFO["global"].text,
  },
  {
    label: "Searching across all assistants",
    icon: MagnifyingGlassIcon,
    id: "search",
    description: "Searching across all assistants",
  },
] as const;

export type AssistantManagerTabsType =
  (typeof ASSISTANT_MANAGER_TABS)[number]["id"];

type RowData = {
  name: string;
  description: string;
  pictureUrl: string;
  usage: AgentUsageType | undefined;
  feedbacks: { up: number; down: number } | undefined;
  lastUpdate: string | null;
  scope: AgentConfigurationScope;
  onClick?: () => void;
};

const calculateFeedback = (row: Row<RowData>) => {
  const feedbacks = row.original.feedbacks;
  const totalFeedbacks = feedbacks ? feedbacks.up + feedbacks.down : 0;
  return feedbacks && totalFeedbacks > 0 ? feedbacks.up / totalFeedbacks : 0;
};

const getTableColumns = () => {
  return [
    {
      header: "Name",
      accessorKey: "name",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          <div className={classNames("flex flex-row items-center gap-3 px-4")}>
            <div className="">
              <Avatar visual={info.row.original.pictureUrl} size="md" />
            </div>
            <div className="flex min-w-0 grow flex-col">
              <div className="overflow-hidden text-ellipsis whitespace-nowrap text-base font-semibold">
                {`@${info.getValue()}`}
              </div>
              <div className="overflow-hidden text-ellipsis whitespace-nowrap text-element-600">
                {info.row.original.description}
              </div>
            </div>
          </div>
        </DataTable.CellContent>
      ),
      meta: { className: "h-16" },
    },
    {
      header: "Messages",
      accessorKey: "usage.messageCount",
      cell: (info: CellContext<RowData, AgentUsageType | undefined>) => (
        <DataTable.CellContent>
          <Tooltip
            label={assistantUsageMessage({
              assistantName: info.row.original.name,
              usage: info.row.original.usage || null,
              isLoading: false,
              isError: false,
              shortVersion: true,
            })}
            trigger={
              <span className="px-2">
                {info.row.original.usage?.messageCount ?? 0}
              </span>
            }
          />
        </DataTable.CellContent>
      ),
      meta: {
        width: "6rem",
      },
    },
    {
      header: "Active Users",
      accessorKey: "usage.userCount",
      cell: (info: CellContext<RowData, AgentUsageType | undefined>) => (
        <DataTable.CellContent>
          <Tooltip
            label={assistantActiveUsersMessage({
              usage: info.row.original.usage || null,
              isLoading: false,
              isError: false,
            })}
            trigger={
              <span className="px-2">
                {info.row.original.usage?.userCount ?? 0}
              </span>
            }
          />
        </DataTable.CellContent>
      ),
      meta: {
        width: "6rem",
      },
    },
    {
      header: "Feedbacks",
      accessorKey: "feedbacks",
      cell: (info: CellContext<RowData, { up: number; down: number }>) => {
        if (info.row.original.scope === "global") {
          return "-";
        }
        const f = info.getValue();
        if (f) {
          const feedbacksCount = `${f.up + f.down} feedback${pluralize(f.up + f.down)} over the last 30 days`;
          return (
            <DataTable.CellContent>
              <Tooltip
                label={feedbacksCount}
                trigger={
                  <div className="flex flex-row items-center gap-2">
                    <div className="flex flex-row items-center">
                      <div>{f.up}</div>
                      <div>
                        <HandThumbUpIcon className="h-4 w-4 pl-1" />
                      </div>
                    </div>
                    <div className="flex flex-row items-center">
                      <div>{f.down}</div>
                      <div>
                        <HandThumbDownIcon className="h-4 w-4 pl-1" />
                      </div>
                    </div>
                  </div>
                }
              />
            </DataTable.CellContent>
          );
        }
      },
      sortingFn: (rowA: Row<RowData>, rowB: Row<RowData>) =>
        calculateFeedback(rowA) - calculateFeedback(rowB),
      meta: {
        width: "6rem",
      },
    },
    {
      header: "Last Update",
      accessorKey: "lastUpdate",
      cell: (info: CellContext<RowData, number>) => (
        <DataTable.CellContent>
          {info.getValue()
            ? formatTimestampToFriendlyDate(info.getValue(), "short")
            : "-"}
        </DataTable.CellContent>
      ),
      meta: {
        width: "10rem",
      },
    },
    {
      header: "",
      accessorKey: "action",
      cell: (info: CellContext<RowData, number>) => (
        <DataTable.CellContent>{info.getValue()}</DataTable.CellContent>
      ),
      meta: {
        width: "0",
      },
    },
  ];
};

type AgentsTableProps = {
  owner: WorkspaceType;
  agents: LightAgentConfigurationType[];
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
            agentConfiguration.scope !== "global"
              ? [
                  {
                    label: "Edit",
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
                  },
                  {
                    label: "Copy assistant ID",
                    icon: ClipboardIcon,
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      void navigator.clipboard.writeText(
                        agentConfiguration.sId
                      );
                    },
                  },
                  {
                    label: "Duplicate (New)",
                    icon: ClipboardIcon,
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      void router.push(
                        `/w/${owner.sId}/builder/assistants/new?flow=personal_assistants&duplicate=${agentConfiguration.sId}`
                      );
                    },
                  },
                  {
                    label: "Delete",
                    icon: TrashIcon,
                    variant: "warning",
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      setShowDeleteDialog({ open: true, agentConfiguration });
                    },
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
            columns={getTableColumns()}
          />
        )}
      </div>
    </>
  );
}

function GlobalAgentAction({
  agent,
  owner,
  handleToggleAgentStatus,
  showDisabledFreeWorkspacePopup,
  setShowDisabledFreeWorkspacePopup,
}: {
  agent: LightAgentConfigurationType;
  owner: WorkspaceType;
  handleToggleAgentStatus: (
    agent: LightAgentConfigurationType
  ) => Promise<void>;
  showDisabledFreeWorkspacePopup: string | null;
  setShowDisabledFreeWorkspacePopup: (s: string | null) => void;
}) {
  const router = useRouter();
  if (agent.sId === "helper") {
    return null;
  }

  if (agent.sId === "dust") {
    return (
      <div className="absolute -m-[18px] ml-2">
        <Button
          variant="ghost"
          icon={Cog6ToothIcon}
          size="sm"
          disabled={!isBuilder(owner)}
          onClick={(e: Event) => {
            e.stopPropagation();
            void router.push(`/w/${owner.sId}/builder/assistants/dust`);
          }}
        />
      </div>
    );
  }

  return (
    <div className="absolute -m-[14px] ml-2">
      <SliderToggle
        size="xs"
        onClick={async (e) => {
          e.stopPropagation();
          await handleToggleAgentStatus(agent);
        }}
        selected={agent.status === "active"}
        disabled={agent.status === "disabled_missing_datasource"}
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
    </div>
  );
}
