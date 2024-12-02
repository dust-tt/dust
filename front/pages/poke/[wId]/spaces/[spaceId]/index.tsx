import type {
  LightWorkspaceType,
  PokeSpaceType,
  UserTypeWithWorkspaces,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { MembersDataTable } from "@app/components/poke/members/table";
import { ViewSpaceViewTable } from "@app/components/poke/spaces/view";
import { getMembers } from "@app/lib/api/workspace";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { spaceToPokeJSON } from "@app/lib/poke/utils";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import PokeLayout from "@app/pages/poke/PokeLayout";

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

export default function DataSourceViewPage({
  members,
  owner,
  space,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <div className="flex flex-row gap-x-6">
      <ViewSpaceViewTable space={space} />
      <div className="flex grow flex-col">
        <MembersDataTable members={members} owner={owner} readonly />
      </div>
    </div>
  );
}

DataSourceViewPage.getLayout = (page: ReactElement) => {
  return <PokeLayout>{page}</PokeLayout>;
};
