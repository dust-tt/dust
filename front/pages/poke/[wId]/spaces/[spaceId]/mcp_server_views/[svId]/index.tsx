import { Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { ViewMCPServerViewTable } from "@app/components/poke/mcp_server_views/view";
import PokeLayout from "@app/components/poke/PokeLayout";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { mcpServerViewToPokeJSON } from "@app/lib/poke/utils";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { PokeMCPServerViewType, WorkspaceType } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  mcpServerView: PokeMCPServerViewType;
  owner: WorkspaceType;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { svId } = context.params || {};
  if (typeof svId !== "string") {
    return {
      notFound: true,
    };
  }

  const mcpServerView = await MCPServerViewResource.fetchById(auth, svId);
  if (!mcpServerView) {
    return {
      notFound: true,
    };
  }

  const pokeMCPServerView = await mcpServerViewToPokeJSON(mcpServerView);

  return {
    props: {
      mcpServerView: pokeMCPServerView,
      owner,
    },
  };
});

export default function MCPServerViewPage({
  mcpServerView,
  owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <h3 className="text-xl font-bold">
        MCP Server View {getMcpServerViewDisplayName(mcpServerView)} in space{" "}
        <a
          href={`/poke/${owner.sId}/spaces/${mcpServerView.spaceId}`}
          className="text-highlight-500"
        >
          {mcpServerView.space?.name || mcpServerView.spaceId}
        </a>{" "}
        within workspace{" "}
        <a href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </a>
      </h3>
      <div className="mt-4">
        <Page.Vertical align="stretch">
          <ViewMCPServerViewTable mcpServerView={mcpServerView} owner={owner} />
        </Page.Vertical>
      </div>
    </>
  );
}

MCPServerViewPage.getLayout = (
  page: ReactElement,
  {
    owner,
    mcpServerView,
  }: { owner: WorkspaceType; mcpServerView: PokeMCPServerViewType }
) => {
  return (
    <PokeLayout
      title={`${owner.name} - ${getMcpServerViewDisplayName(mcpServerView)} in ${
        mcpServerView.space?.name || mcpServerView.spaceId
      }`}
    >
      {page}
    </PokeLayout>
  );
};
