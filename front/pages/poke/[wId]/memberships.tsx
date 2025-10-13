import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";
import React from "react";

import { InvitationsDataTable } from "@app/components/poke/invitations/table";
import { MembersDataTable } from "@app/components/poke/members/table";
import PokeLayout from "@app/components/poke/PokeLayout";
import {
  getMembershipInvitationUrl,
  getPendingInvitations,
} from "@app/lib/api/invitation";
import { getMembers } from "@app/lib/api/workspace";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type {
  MembershipInvitationTypeWithLink,
  UserTypeWithWorkspaces,
  WorkspaceType,
} from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  members: UserTypeWithWorkspaces[];
  pendingInvitations: MembershipInvitationTypeWithLink[];
  owner: WorkspaceType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const user = auth.user();

  if (!owner || !user) {
    return {
      notFound: true,
    };
  }

  const [{ members }, pendingInvitations] = await Promise.all([
    getMembers(auth),
    getPendingInvitations(auth),
  ]);

  return {
    props: {
      members,
      pendingInvitations: pendingInvitations.map((invite) => ({
        ...invite,
        inviteLink: getMembershipInvitationUrl(owner, invite.id),
      })),
      owner,
    },
  };
});

const MembershipsPage = ({
  members,
  pendingInvitations,
  owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  return (
    <>
      <h3 className="text-xl font-bold">
        Members of workspace{" "}
        <a href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </a>
      </h3>
      <div className="flex-grow p-6">
        <div className="flex justify-center">
          <MembersDataTable members={members} owner={owner} />
        </div>
        <div className="flex justify-center">
          <InvitationsDataTable
            invitations={pendingInvitations}
            owner={owner}
          />
        </div>
      </div>
    </>
  );
};

MembershipsPage.getLayout = (
  page: ReactElement,
  { owner }: { owner: WorkspaceType }
) => {
  return <PokeLayout title={`${owner.name} - Memberships`}>{page}</PokeLayout>;
};

export default MembershipsPage;
