import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { MCPServerViewPage } from "@app/components/poke/pages/MCPServerViewPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type { LightWorkspaceType } from "@app/types";
import { isString } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: LightWorkspaceType;
  svId: string;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { wId, spaceId, svId } = context.params ?? {};
  if (!isString(wId) || !isString(spaceId) || !isString(svId)) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      svId,
    },
  };
});

export default function MCPServerViewPageNextJS({
  owner,
  svId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <MCPServerViewPage owner={owner} svId={svId} />;
}

MCPServerViewPageNextJS.getLayout = (
  page: ReactElement,
  { owner }: { owner: LightWorkspaceType }
) => {
  return (
    <PokeLayout title={`${owner.name} - MCP Server View`}>{page}</PokeLayout>
  );
};
