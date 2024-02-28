import { IconButton, TrashIcon } from "@dust-tt/sparkle";
import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { isRetrievalConfiguration } from "@dust-tt/types";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import type { KeyedMutator } from "swr";

import type { GetAgentConfigurationsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations";

type AgentConfigurationDisplayType = {
  sId: string;
  scope: string;
  name: string;
  status: string;
  // createdAt: Date;
};

export function makeColumnsForAssistants(
  owner: WorkspaceType,
  agentConfigurations: LightAgentConfigurationType[],
  mutate: KeyedMutator<GetAgentConfigurationsResponseBody>
): ColumnDef<AgentConfigurationDisplayType>[] {
  return [
    {
      accessorKey: "sId",
      cell: ({ row }) => {
        const sId: string = row.getValue("sId");

        return <Link href={`/poke/${owner.sId}/assistants/${sId}`}>{sId}</Link>;
      },
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Id</p>
            <IconButton
              variant="tertiary"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
    {
      accessorKey: "name",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Name</p>
            <IconButton
              variant="tertiary"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
    {
      accessorKey: "scope",
      header: "Scope",
    },
    {
      accessorKey: "status",
      header: "Status",
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const assistant = row.original;

        return (
          <IconButton
            icon={TrashIcon}
            size="xs"
            variant="tertiary"
            onClick={async () => {
              await archiveAssistant(owner, mutate, assistant);
            }}
          />
        );
      },
    },
  ];
}

async function archiveAssistant(
  owner: WorkspaceType,
  mutate: KeyedMutator<GetAgentConfigurationsResponseBody>,
  agentConfiguration: AgentConfigurationDisplayType
) {
  if (
    !window.confirm(
      `Are you sure you want to archive the ${agentConfiguration.name} assistant? There is no going back.`
    )
  ) {
    return;
  }

  try {
    const r = await fetch(
      `/api/poke/workspaces/${owner.sId}/agent_configurations/${agentConfiguration.sId}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (!r.ok) {
      throw new Error("Failed to archive agent configuration.");
    }

    await mutate();
  } catch (e) {
    console.error(e);
    window.alert("An error occurred while archiving the agent configuration.");
  }
}

// async function deleteDataSource(
//   owner: WorkspaceType,
//   agentConfigurations: AgentConfigurationType[],
//   dataSourceName: string,
//   reload: () => void
// ) {
//   const retrievalAgents = agentConfigurations.filter((a) => {
//     if (isRetrievalConfiguration(a.action)) {
//       return a.action.dataSources.some(
//         (ds) => ds.dataSourceId === dataSourceName
//       );
//     }
//     return false;
//   });
//   if (retrievalAgents.length > 0) {
//     window.alert(
//       "Please archive agents using this data source first: " +
//         retrievalAgents.map((a) => a.name).join(", ")
//     );
//     return;
//   }
//   if (
//     !window.confirm(
//       `Are you sure you want to delete the ${dataSourceName} data source? There is no going back.`
//     )
//   ) {
//     return;
//   }

//   if (!window.confirm(`really, Really, REALLY sure ?`)) {
//     return;
//   }

//   try {
//     const r = await fetch(
//       `/api/poke/workspaces/${owner.sId}/data_sources/${dataSourceName}`,
//       {
//         method: "DELETE",
//         headers: {
//           "Content-Type": "application/json",
//         },
//       }
//     );
//     if (!r.ok) {
//       throw new Error("Failed to delete data source.");
//     }
//     reload();
//   } catch (e) {
//     console.error(e);
//     window.alert("An error occurred while deleting the data source.");
//   }
// }
