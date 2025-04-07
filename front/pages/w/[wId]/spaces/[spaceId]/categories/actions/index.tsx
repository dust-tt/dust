import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { SpaceActionsList } from "@app/components/spaces/SpaceActionsList";
import type { SpaceLayoutPageProps } from "@app/components/spaces/SpaceLayout";
import { SpaceLayout } from "@app/components/spaces/SpaceLayout";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { DataSourceViewCategory, SpaceType } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<
  SpaceLayoutPageProps & {
    category: DataSourceViewCategory;
    isAdmin: boolean;
    space: SpaceType;
  }
>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const plan = auth.getNonNullablePlan();
  const isAdmin = auth.isAdmin();

  const { spaceId } = context.query;

  if (!subscription || typeof spaceId !== "string") {
    return {
      notFound: true,
    };
  }

  const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space || !systemSpace || !space.canReadOrAdministrate(auth)) {
    return {
      notFound: true,
    };
  }

  const isBuilder = auth.isBuilder();
  const canWriteInSpace = space.canWrite(auth);

  return {
    props: {
      canReadInSpace: space.canRead(auth),
      canWriteInSpace,
      category: "actions",
      isAdmin,
      isBuilder,
      owner,
      plan,
      space: space.toJSON(),
      subscription,
    },
  };
});

export default function Space({
  isAdmin,
  owner,
  space,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <SpaceActionsList isAdmin={isAdmin} owner={owner} space={space} />;
}

Space.getLayout = (page: ReactElement, pageProps: any) => {
  return <SpaceLayout pageProps={pageProps}>{page}</SpaceLayout>;
};
