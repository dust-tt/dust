import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { makeColumnsForProjectDatabase } from "@app/components/poke/projects/project_databases/columns";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeProjectDatabases } from "@app/poke/swr/project_databases";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { LightWorkspaceType } from "@app/types/user";

interface ProjectDatabaseDataTableProps {
  owner: LightWorkspaceType;
  projectId: string;
}

export function ProjectDatabaseDataTable({
  owner,
  projectId,
}: ProjectDatabaseDataTableProps) {
  const useDatabasesForProject = (props: PokeConditionalFetchProps) =>
    usePokeProjectDatabases({ ...props, projectId });

  return (
    <PokeDataTableConditionalFetch
      // The databases are owned by the legacy Project sandbox, so loading them starts it.
      buttonText="Load Data (starts the project sandbox)"
      header="Project Databases"
      owner={owner}
      useSWRHook={useDatabasesForProject}
    >
      {(items) => (
        <PokeDataTable columns={makeColumnsForProjectDatabase()} data={items} />
      )}
    </PokeDataTableConditionalFetch>
  );
}
