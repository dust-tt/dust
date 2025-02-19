import type {
  LightWorkspaceType,
  PokeSpaceType,
  UserTypeWithWorkspaces,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { DataSourceViewsDataTable } from "@app/components/poke/data_source_views/table";
import { MembersDataTable } from "@app/components/poke/members/table";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import PokeLayout from "@app/components/poke/PokeLayout";
import { ViewSpaceViewTable } from "@app/components/poke/spaces/view";
import { getMembers } from "@app/lib/api/workspace";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { spaceToPokeJSON } from "@app/lib/poke/utils";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";

export const getServerSideProps = withSuperUserAuthRequirements<{
  members: UserTypeWithWorkspaces[];
  owner: LightWorkspaceType;
  space: PokeSpaceType;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { spaceId } = context.params || {};
  if (typeof spaceId !== "string") {
    return {
      notFound: true,
    };
  }

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    return {
      notFound: true,
    };
  }

  const users: UserResource[] = [];
  for (const group of space.groups) {
    const groupMembers = await group.getActiveMembers(auth);

    users.push(...groupMembers);
  }

  const memberships = await getMembers(auth);

  const userWithWorkspaces = users.reduce<UserTypeWithWorkspaces[]>(
    (acc, user) => {
      const member = memberships.members.find((m) => m.sId === user.sId);

      if (member) {
        acc.push(member);
      }

      return acc;
    },
    []
  );

  return {
    props: {
      members: userWithWorkspaces,
      owner,
      space: spaceToPokeJSON(space),
    },
  };
});

export default function SpacePage({
  members,
  owner,
  space,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <div className="flex flex-row gap-x-6">
      <ViewSpaceViewTable space={space} />
      <div className="flex grow flex-col">
        <MembersDataTable members={members} owner={owner} readonly />
        <PluginList
          resourceType="spaces"
          workspaceResource={{
            workspace: owner,
            resourceId: space.sId,
          }}
        />
        <DataSourceViewsDataTable owner={owner} spaceId={space.sId} />
      </div>
    </div>
  );
}

SpacePage.getLayout = (page: ReactElement) => {
  return <PokeLayout>{page}</PokeLayout>;
};
