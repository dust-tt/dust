import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { TriggerDetailsPage } from "@app/components/poke/pages/TriggerDetailsPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type { LightWorkspaceType, WorkspaceType } from "@app/types";
import { isString } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: LightWorkspaceType;
  triggerId: string;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { wId, aId, triggerId } = context.params ?? {};
  if (!isString(wId) || !isString(aId) || !isString(triggerId)) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      triggerId,
    },
  };
});

export default function TriggerDetailsPageNextJS({
  owner,
  triggerId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <TriggerDetailsPage owner={owner} triggerId={triggerId} />;
}

TriggerDetailsPageNextJS.getLayout = (
  page: ReactElement,
  { owner }: { owner: WorkspaceType }
) => {
  return <PokeLayout title={`${owner.name} - Trigger`}>{page}</PokeLayout>;
};
