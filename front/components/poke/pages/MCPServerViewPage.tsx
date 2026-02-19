import { ViewMCPServerViewTable } from "@app/components/poke/mcp_server_views/view";
import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { usePokeMCPServerViewDetails } from "@app/poke/swr/mcp_server_view_details";
import { LinkWrapper, Spinner } from "@dust-tt/sparkle";

export function MCPServerViewPage() {
  const owner = useWorkspace();
  useSetPokePageTitle(`${owner.name} - MCP Server View`);

  const svId = useRequiredPathParam("svId");
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
        <LinkWrapper
          href={`/poke/${owner.sId}/spaces/${mcpServerView.spaceId}`}
          className="text-highlight-500"
        >
          {mcpServerView.space?.name || mcpServerView.spaceId}
        </LinkWrapper>{" "}
        within workspace{" "}
        <LinkWrapper href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </LinkWrapper>
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
