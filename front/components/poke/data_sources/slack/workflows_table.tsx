import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { usePokeSlackWorkflows } from "@app/poke/swr/slack_workflows";
import type { SlackWorkflowType } from "@app/types/api/slack/workflows";
import type { LightWorkspaceType } from "@app/types/user";
import { IconButton, Trash01 } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

type SlackWorkflowRow = {
  botName: string;
  spaceNames: string;
  createdAt: number;
};

function makeColumnsForSlackWorkflows(
  onRevoke: (botName: string) => Promise<void>
): ColumnDef<SlackWorkflowRow>[] {
  return [
    {
      accessorKey: "botName",
      header: () => <p>Workflow / Bot Name</p>,
    },
    {
      accessorKey: "spaceNames",
      header: () => <p>Spaces</p>,
    },
    {
      accessorKey: "createdAt",
      header: () => <p>Allowed On</p>,
      cell: ({ row }) => (
        <p>{formatTimestampToFriendlyDate(row.original.createdAt)}</p>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <IconButton
          icon={Trash01}
          size="xs"
          variant="warning"
          onClick={async () => {
            await onRevoke(row.original.botName);
          }}
        />
      ),
    },
  ];
}

function prepareSlackWorkflowsForDisplay(
  workflows: SlackWorkflowType[]
): SlackWorkflowRow[] {
  return workflows.map((workflow) => ({
    botName: workflow.botName,
    spaceNames: workflow.spaces.map((space) => space.name).join(", "),
    createdAt: workflow.createdAt,
  }));
}

interface SlackWorkflowsTableProps {
  owner: LightWorkspaceType;
}

export function SlackWorkflowsTable({ owner }: SlackWorkflowsTableProps) {
  const { workflows, isSlackWorkflowsLoading, revokeSlackWorkflow } =
    usePokeSlackWorkflows({ owner });

  const handleRevoke = async (botName: string) => {
    if (
      !window.confirm(
        `Revoke "${botName}"? It will no longer be able to summon agents from Slack.`
      )
    ) {
      return;
    }

    await revokeSlackWorkflow(botName);
  };

  return (
    <div className="my-4 flex min-h-48 flex-col rounded-lg border bg-background">
      <div className="flex justify-between gap-3 rounded-t-lg border-b border-separator bg-background p-4">
        <h2 className="text-md font-bold">
          Slack Workflows Allowed To Summon Agents
        </h2>
      </div>
      <div className="flex flex-grow flex-col justify-center p-4">
        <PokeDataTable
          columns={makeColumnsForSlackWorkflows(handleRevoke)}
          data={prepareSlackWorkflowsForDisplay(workflows)}
          isLoading={isSlackWorkflowsLoading}
        />
      </div>
    </div>
  );
}
