import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { makeColumnsForProjectPodFunction } from "@app/components/poke/projects/pod_functions/columns";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeProjectPodFunction } from "@app/poke/swr/project_pod_functions";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { LightWorkspaceType } from "@app/types/user";

interface ProjectPodFunctionDataTableProps {
  owner: LightWorkspaceType;
  projectId: string;
}

export function ProjectPodFunctionDataTable({
  owner,
  projectId,
}: ProjectPodFunctionDataTableProps) {
  const usePodFunctionForProject = (props: PokeConditionalFetchProps) =>
    usePokeProjectPodFunction({ ...props, projectId });

  return (
    <PokeDataTableConditionalFetch
      header="Pod Functions"
      owner={owner}
      useSWRHook={usePodFunctionForProject}
    >
      {(items) => (
        <PokeDataTable
          columns={makeColumnsForProjectPodFunction()}
          data={items}
        />
      )}
    </PokeDataTableConditionalFetch>
  );
}
