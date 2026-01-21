import type { InferGetServerSidePropsType } from "next";
import { useSearchParams } from "next/navigation";
import type { ReactElement } from "react";

import { AppPage } from "@app/components/poke/pages/AppPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type { LightWorkspaceType } from "@app/types";
import { isString } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: LightWorkspaceType;
  appId: string;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { wId, spaceId, appId } = context.params ?? {};
  if (!isString(wId) || !isString(spaceId) || !isString(appId)) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      appId,
    },
  };
});

export default function AppPageNextJS({
  owner,
  appId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const searchParams = useSearchParams();
  const hash = searchParams?.get("hash") ?? null;

  return <AppPage owner={owner} appId={appId} hash={hash} />;
}

AppPageNextJS.getLayout = (
  page: ReactElement,
  { owner }: { owner: LightWorkspaceType }
) => {
  return <PokeLayout title={`${owner.name} - App`}>{page}</PokeLayout>;
};
