import { Spinner } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { ViewMCPServerViewTable } from "@app/components/poke/mcp_server_views/view";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import PokeLayout from "@app/components/poke/PokeLayout";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { usePokeMCPServerViewDetails } from "@app/poke/swr/mcp_server_view_details";
import type { LightWorkspaceType } from "@app/types";
import { isString } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: LightWorkspaceType;
  params: { wId: string; spaceId: string; svId: string };
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
      params: { wId, spaceId, svId },
    },
  };
});

export default function MCPServerViewPage({
  owner,
  params,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { svId } = params;

  const {
    data: mcpServerViewDetails,
    isLoading,
    isError,
  } = usePokeMCPServerViewDetails({
    owner,
    mcpServerViewId: svId,
    disabled: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !mcpServerViewDetails) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading MCP server view details.</p>
      </div>
    );
  }

  const { mcpServerView } = mcpServerViewDetails;

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
      <div className="flex flex-row gap-x-6">
        <ViewMCPServerViewTable mcpServerView={mcpServerView} owner={owner} />
        <div className="mt-4 flex grow flex-col gap-y-4">
          <PluginList
            pluginResourceTarget={{
              resourceId: mcpServerView.sId,
              resourceType: "mcp_server_views",
              workspace: owner,
            }}
          />
        </div>
      </div>
    </>
  );
}

MCPServerViewPage.getLayout = (
  page: ReactElement,
  { owner }: { owner: LightWorkspaceType }
) => {
  return (
    <PokeLayout title={`${owner.name} - MCP Server View`}>{page}</PokeLayout>
  );
};
