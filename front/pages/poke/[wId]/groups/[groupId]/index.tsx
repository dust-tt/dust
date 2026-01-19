import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { GroupPage } from "@app/components/poke/pages/GroupPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type { LightWorkspaceType } from "@app/types";
import { isString } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: LightWorkspaceType;
  groupId: string;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { wId, groupId } = context.params ?? {};
  if (!isString(wId) || !isString(groupId)) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      groupId,
    },
  };
});

export default function GroupPageWrapper({
  owner,
  groupId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <GroupPage owner={owner} groupId={groupId} />;
}

GroupPageWrapper.getLayout = (
  page: ReactElement,
  { owner }: { owner: LightWorkspaceType }
) => {
  return <PokeLayout title={`Group ${owner.name}`}>{page}</PokeLayout>;
};
