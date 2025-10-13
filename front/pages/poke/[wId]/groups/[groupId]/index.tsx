import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { ViewGroupTable } from "@app/components/poke/groups/view";
import { MembersDataTable } from "@app/components/poke/members/table";
import PokeLayout from "@app/components/poke/PokeLayout";
import { getMembers } from "@app/lib/api/workspace";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { GroupResource } from "@app/lib/resources/group_resource";
import type {
  GroupType,
  LightWorkspaceType,
  UserTypeWithWorkspaces,
} from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  members: UserTypeWithWorkspaces[];
  owner: LightWorkspaceType;
  group: GroupType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  if (!owner) {
    return {
      notFound: true,
    };
  }

  const { groupId } = context.params || {};
  if (typeof groupId !== "string") {
    return {
      notFound: true,
    };
  }

  const groupRes = await GroupResource.fetchById(auth, groupId);
  if (groupRes.isErr()) {
    return {
      notFound: true,
    };
  }

  const group = groupRes.value;

  const groupMembers = await group.getActiveMembers(auth);
  const memberships = await getMembers(auth);

  const userWithWorkspaces = groupMembers.reduce<UserTypeWithWorkspaces[]>(
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
      group: group.toJSON(),
    },
  };
});

export default function GroupPage({
  members,
  owner,
  group,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <h3 className="text-xl font-bold">
        Group {group.name} ({group.kind}) within workspace{" "}
        <a href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </a>
      </h3>
      <div className="flex flex-row gap-x-6">
        <ViewGroupTable group={group} />
        <MembersDataTable members={members} owner={owner} readonly />
      </div>
    </>
  );
}

GroupPage.getLayout = (
  page: ReactElement,
  { owner }: { owner: LightWorkspaceType }
) => {
  return <PokeLayout title={`Group ${owner.name}`}>{page}</PokeLayout>;
};
