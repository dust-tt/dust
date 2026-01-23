import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { SpacePage } from "@app/components/poke/pages/SpacePage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type { LightWorkspaceType } from "@app/types";
import { isString } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: LightWorkspaceType;
  spaceId: string;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { wId, spaceId } = context.params ?? {};
  if (!isString(wId) || !isString(spaceId)) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      spaceId,
    },
  };
});

export default function SpacePageNextJS({
  owner,
  spaceId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <SpacePage owner={owner} spaceId={spaceId} />;
}

SpacePageNextJS.getLayout = (
  page: ReactElement,
  { owner }: { owner: LightWorkspaceType }
) => {
  return <PokeLayout title={`${owner.name} - Space`}>{page}</PokeLayout>;
};
