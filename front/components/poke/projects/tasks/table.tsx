import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { makeColumnsForProjectTasks } from "@app/components/poke/projects/tasks/columns";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeProjectTasks } from "@app/poke/swr/project_tasks";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { WorkspaceType } from "@app/types/user";

interface ProjectTasksDataTableProps {
  owner: WorkspaceType;
  projectId: string;
}

export function ProjectTasksDataTable({
  owner,
  projectId,
}: ProjectTasksDataTableProps) {
  const useTasksForProject = (props: PokeConditionalFetchProps) =>
    usePokeProjectTasks({ ...props, projectId });

  return (
    <PokeDataTableConditionalFetch
      header="Tasks"
      owner={owner}
      useSWRHook={useTasksForProject}
    >
      {(tasks) => (
        <PokeDataTable
          columns={makeColumnsForProjectTasks(owner)}
          data={tasks}
        />
      )}
    </PokeDataTableConditionalFetch>
  );
}
