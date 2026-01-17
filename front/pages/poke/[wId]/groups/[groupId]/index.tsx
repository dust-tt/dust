import { Spinner } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { ViewGroupTable } from "@app/components/poke/groups/view";
import { MembersDataTable } from "@app/components/poke/members/table";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { usePokeGroupDetails } from "@app/poke/swr/group_details";
import type { LightWorkspaceType } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: LightWorkspaceType;
  params: { wId: string; groupId: string };
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const { groupId } = context.params || {};
  if (typeof groupId !== "string") {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      params: context.params as { wId: string; groupId: string },
    },
  };
});

export default function GroupPage({
  owner,
  params,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { groupId } = params;

  const {
    data: groupDetails,
    isLoading,
    isError,
  } = usePokeGroupDetails({
    owner,
    groupId,
    disabled: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !groupDetails) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading group details.</p>
      </div>
    );
  }

  const { members, group } = groupDetails;

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
