import { Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { ViewMCPServerViewTable } from "@app/components/poke/mcp_server_views/view";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { mcpServerViewToPokeJSON } from "@app/lib/poke/utils";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { PokeMCPServerViewType, WorkspaceType } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  mcpServerView: PokeMCPServerViewType;
  owner: WorkspaceType;
}>(async (context, auth) => {
  const { wId, spaceId, svId } = context.params || {};
  if (
    typeof wId !== "string" ||
    typeof spaceId !== "string" ||
    typeof svId !== "string"
  ) {
    return {
      notFound: true,
    };
  }

  const owner = auth.workspace();
  if (!owner) {
    return {
      notFound: true,
    };
  }

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    return {
      notFound: true,
    };
  }

  const mcpServerView = await MCPServerViewResource.fetchById(auth, svId);
  if (!mcpServerView || mcpServerView.space.id !== space.id) {
    return {
      notFound: true,
    };
  }

  // Convert to PokeMCPServerViewType
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
        MCP Server View: {mcpServerView.server.name} in space:{" "}
        <a
          href={`/poke/${owner.sId}/spaces/${mcpServerView.spaceId}`}
          className="text-highlight-500"
        >
          {mcpServerView.space?.name || mcpServerView.spaceId}
        </a>{" "}
        of workspace:{" "}
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
      title={`${owner.name} - ${mcpServerView.server.name} in ${
        mcpServerView.space?.name || mcpServerView.spaceId
      }`}
    >
      {page}
    </PokeLayout>
  );
};
