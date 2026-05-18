import { DataSourceViewsDataTable } from "@app/components/poke/data_source_views/table";
import { MembersDataTable } from "@app/components/poke/members/table";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import { ProjectConnectorKnowledgeDataTable } from "@app/components/poke/projects/connector_knowledge/table";
import { ProjectTasksDataTable } from "@app/components/poke/projects/tasks/table";
import { ViewProjectWorkflowTable } from "@app/components/poke/projects/workflow/view";
import { ViewSpaceViewTable } from "@app/components/poke/spaces/view";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import type { PokeGetSpaceDetails } from "@app/pages/api/poke/workspaces/[wId]/spaces/[spaceId]/details";
import { LinkWrapper } from "@dust-tt/sparkle";

interface ProjectPageProps {
  details: PokeGetSpaceDetails;
}

export function ProjectPage({ details }: ProjectPageProps) {
  const owner = useWorkspace();
  useDocumentTitle(`Poke - ${owner.name} - Pod`);

  const { members, metadata, space } = details;

  return (
    <>
      <h3 className="text-xl font-bold">
        Pod {space.name} within workspace{" "}
        <LinkWrapper href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </LinkWrapper>
      </h3>
      {metadata?.description && (
        <p className="mt-2 text-sm text-muted-foreground">
          {metadata.description}
        </p>
      )}
      <div className="flex flex-row gap-x-6">
        <ViewSpaceViewTable space={space} />
        <div className="mt-4 flex grow flex-col">
          {Object.entries(members).map(([groupName, groupMembers]) => (
            <MembersDataTable
              key={groupName}
              groupName={groupName}
              members={groupMembers}
              owner={owner}
              readonly
            />
          ))}
          <PluginList
            pluginResourceTarget={{
              resourceId: space.sId,
              resourceType: "spaces",
              workspace: owner,
            }}
          />
          <ViewProjectWorkflowTable owner={owner} projectId={space.sId} />
          <ProjectConnectorKnowledgeDataTable
            owner={owner}
            projectId={space.sId}
          />
          <ProjectTasksDataTable owner={owner} projectId={space.sId} />
          <DataSourceViewsDataTable owner={owner} spaceId={space.sId} />
        </div>
      </div>
    </>
  );
}
