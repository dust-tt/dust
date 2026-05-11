import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { makeColumnsForProjectConnectorKnowledge } from "@app/components/poke/projects/connector_knowledge/columns";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeProjectConnectorKnowledge } from "@app/poke/swr/project_connector_knowledge";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { WorkspaceType } from "@app/types/user";

interface ProjectConnectorKnowledgeDataTableProps {
  owner: WorkspaceType;
  projectId: string;
}

export function ProjectConnectorKnowledgeDataTable({
  owner,
  projectId,
}: ProjectConnectorKnowledgeDataTableProps) {
  const useConnectorKnowledgeForProject = (props: PokeConditionalFetchProps) =>
    usePokeProjectConnectorKnowledge({ ...props, projectId });

  return (
    <PokeDataTableConditionalFetch
      header="Knowledge from connectors"
      owner={owner}
      useSWRHook={useConnectorKnowledgeForProject}
    >
      {(items) => (
        <PokeDataTable
          columns={makeColumnsForProjectConnectorKnowledge(owner)}
          data={items}
        />
      )}
    </PokeDataTableConditionalFetch>
  );
}
