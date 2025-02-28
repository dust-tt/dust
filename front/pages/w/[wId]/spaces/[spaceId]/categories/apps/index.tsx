import type { DataSourceViewCategory, SpaceType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import { SpaceAppsList } from "@app/components/spaces/SpaceAppsList";
import type { SpaceLayoutPageProps } from "@app/components/spaces/SpaceLayout";
import { SpaceLayout } from "@app/components/spaces/SpaceLayout";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import type { ActionApp } from "@app/lib/registry";
import { getDustProdActionRegistry } from "@app/lib/registry";
import { SpaceResource } from "@app/lib/resources/space_resource";

export const getServerSideProps = withDefaultUserAuthRequirements<
  SpaceLayoutPageProps & {
    category: DataSourceViewCategory;
    isAdmin: boolean;
    registryApps: ActionApp[] | null;
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

  const isDustAppsSpace =
    owner.sId === config.getDustAppsWorkspaceId() &&
    space.sId === config.getDustAppsSpaceId();

  const registryApps = isDustAppsSpace
    ? Object.values(getDustProdActionRegistry()).map((action) => action.app)
    : null;

  return {
    props: {
      canReadInSpace: space.canRead(auth),
      canWriteInSpace,
      category: "apps",
      isAdmin,
      isBuilder,
      owner,
      plan,
      registryApps,
      space: space.toJSON(),
      subscription,
    },
  };
});

export default function Space({
  canWriteInSpace,
  owner,
  space,
  registryApps,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  return (
    <SpaceAppsList
      owner={owner}
      space={space}
      canWriteInSpace={canWriteInSpace}
      onSelect={(sId) => {
        void router.push(`/w/${owner.sId}/spaces/${space.sId}/apps/${sId}`);
      }}
      registryApps={registryApps}
    />
  );
}

Space.getLayout = (page: ReactElement, pageProps: any) => {
  return <SpaceLayout pageProps={pageProps}>{page}</SpaceLayout>;
};
