import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { makeColumnsForProjects } from "@app/components/poke/projects/columns";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeProjects } from "@app/poke/swr/projects";
import type { WorkspaceType } from "@app/types/user";

interface ProjectsDataTableProps {
  owner: WorkspaceType;
  loadOnInit?: boolean;
}

export function ProjectsDataTable({
  owner,
  loadOnInit,
}: ProjectsDataTableProps) {
  return (
    <PokeDataTableConditionalFetch
      header="Pods"
      owner={owner}
      loadOnInit={loadOnInit}
      useSWRHook={usePokeProjects}
    >
      {(data) => (
        <PokeDataTable columns={makeColumnsForProjects(owner)} data={data} />
      )}
    </PokeDataTableConditionalFetch>
  );
}
