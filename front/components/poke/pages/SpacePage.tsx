import { Spinner } from "@dust-tt/sparkle";

import { DataSourceViewsDataTable } from "@app/components/poke/data_source_views/table";
import { MCPServerViewsDataTable } from "@app/components/poke/mcp_server_views/table";
import { MembersDataTable } from "@app/components/poke/members/table";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import { ViewSpaceViewTable } from "@app/components/poke/spaces/view";
import { usePokeSpaceDetails } from "@app/poke/swr/space_details";
import type { LightWorkspaceType } from "@app/types";

interface SpacePageProps {
  owner: LightWorkspaceType;
  spaceId: string;
}

export function SpacePage({ owner, spaceId }: SpacePageProps) {
  const {
    data: spaceDetails,
    isLoading,
    isError,
  } = usePokeSpaceDetails({
    owner,
    spaceId,
    disabled: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !spaceDetails) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading space details.</p>
      </div>
    );
  }

  const { members, space } = spaceDetails;

  return (
    <>
      <h3 className="text-xl font-bold">
        Space {space.name} ({space.kind}) within workspace{" "}
        <a href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </a>
      </h3>
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
          <DataSourceViewsDataTable owner={owner} spaceId={space.sId} />
          <MCPServerViewsDataTable owner={owner} spaceId={space.sId} />
        </div>
      </div>
    </>
  );
}
