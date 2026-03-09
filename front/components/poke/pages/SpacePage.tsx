import { DataSourceViewsDataTable } from "@app/components/poke/data_source_views/table";
import { MCPServerViewsDataTable } from "@app/components/poke/mcp_server_views/table";
import { MembersDataTable } from "@app/components/poke/members/table";
import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import { ViewSpaceViewTable } from "@app/components/poke/spaces/view";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { usePokeSpaceDetails } from "@app/poke/swr/space_details";
import { LinkWrapper, Spinner } from "@dust-tt/sparkle";

export function SpacePage() {
  const owner = useWorkspace();
  useSetPokePageTitle(`${owner.name} - Space`);

  const spaceId = useRequiredPathParam("spaceId");
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
        <LinkWrapper href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </LinkWrapper>
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
