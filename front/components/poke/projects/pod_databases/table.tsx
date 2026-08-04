import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { makeColumnsForProjectPodDatabase } from "@app/components/poke/projects/pod_databases/columns";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeProjectPodDatabases } from "@app/poke/swr/project_pod_databases";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { LightWorkspaceType } from "@app/types/user";

interface ProjectPodDatabaseDataTableProps {
  owner: LightWorkspaceType;
  projectId: string;
}

export function ProjectPodDatabaseDataTable({
  owner,
  projectId,
}: ProjectPodDatabaseDataTableProps) {
  const usePodDatabasesForProject = (props: PokeConditionalFetchProps) =>
    usePokeProjectPodDatabases({ ...props, projectId });

  return (
    <PokeDataTableConditionalFetch
      // Listing databases runs in the pod itself, which starts the sandbox if it is asleep.
      buttonText="Load Data (starts the pod sandbox)"
      header="Pod Databases"
      owner={owner}
      useSWRHook={usePodDatabasesForProject}
    >
      {(items) => (
        <PokeDataTable
          columns={makeColumnsForProjectPodDatabase()}
          data={items}
        />
      )}
    </PokeDataTableConditionalFetch>
  );
}
