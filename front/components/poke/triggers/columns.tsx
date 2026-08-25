import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import { formatCredits } from "@app/lib/client/credits";
import { clientFetch } from "@app/lib/egress/client";
import type { TriggerType } from "@app/types/assistant/triggers";
import type { LightWorkspaceType } from "@app/types/user";
import { IconButton, LinkWrapper, Trash01 } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

function ConsumptionCell({ trigger }: { trigger: AutomationTriggerRow }) {
  const { credits, runCount } = trigger;
  const creditsLabel = `${formatCredits(credits)} credits`;
  const runUnit = runCount === 1 ? "run" : "runs";
  const creditsPerRun =
    runCount > 0 ? `${formatCredits(credits / runCount)} credits/run` : "—";
  const estimatesLabel = `Est. ${runCount.toLocaleString("en-US")} ${runUnit} · ${creditsPerRun}`;

  return (
    <div className="flex min-h-10 w-52 flex-col justify-center overflow-hidden whitespace-nowrap">
      <span
        className="w-full truncate text-sm font-medium"
        title={creditsLabel}
      >
        {creditsLabel}
      </span>
      <span
        className="w-full truncate text-xs text-muted-foreground"
        title={estimatesLabel}
      >
        {estimatesLabel}
      </span>
    </div>
  );
}

export function makeColumnsForAutomationTriggers(
  owner: LightWorkspaceType,
  onTriggerDeleted: () => Promise<void>
): ColumnDef<AutomationTriggerRow>[] {
  return [
    {
      accessorKey: "triggerId",
      header: "sId",
      enableSorting: false,
      cell: ({ row }) => {
        const trigger = row.original;
        if (trigger.agent.modelId === null) {
          return trigger.triggerId;
        }

        return (
          <LinkWrapper
            href={`/poke/${owner.sId}/assistants/${trigger.agent.agentId}/triggers/${trigger.triggerId}`}
          >
            {trigger.triggerId}
          </LinkWrapper>
        );
      },
    },
    {
      accessorKey: "name",
      header: "Name",
      enableSorting: false,
    },
    {
      id: "agent",
      header: "Agent",
      enableSorting: false,
      accessorFn: (trigger) => trigger.agent.name,
    },
    {
      accessorKey: "kind",
      header: "Kind",
      enableSorting: false,
    },
    {
      accessorKey: "credits",
      header: "Consumption",
      enableSorting: false,
      cell: ({ row }) => <ConsumptionCell trigger={row.original} />,
    },
    {
      accessorKey: "status",
      header: "Status",
      enableSorting: false,
    },
    {
      id: "editor",
      header: "Editor",
      enableSorting: false,
      accessorFn: (trigger) => trigger.editor.email ?? trigger.editor.name,
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <IconButton
          aria-label={`Delete trigger ${row.original.name}`}
          icon={Trash01}
          size="xs"
          variant="outline"
          onClick={async () => {
            await deleteTrigger(owner, onTriggerDeleted, {
              name: row.original.name,
              sId: row.original.triggerId,
            });
          }}
        />
      ),
    },
  ];
}

async function deleteTrigger(
  owner: LightWorkspaceType,
  onTriggerDeleted: () => Promise<void>,
  trigger: Pick<TriggerType, "name" | "sId">
) {
  if (
    !window.confirm(
      `Are you sure you want to delete the trigger "${trigger.name}"?`
    )
  ) {
    return;
  }

  try {
    const r = await clientFetch(
      `/api/poke/workspaces/${owner.sId}/triggers?tId=${trigger.sId}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (!r.ok) {
      throw new Error("Failed to delete trigger.");
    }

    await onTriggerDeleted();
  } catch (e) {
    console.error(e);
    window.alert("An error occurred while deleting the trigger.");
  }
}
