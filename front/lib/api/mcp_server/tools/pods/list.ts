import config from "@app/lib/api/config";
import { getAuthenticatorFromMcpContext } from "@app/lib/api/mcp_server/context";
import { listNonArchivedMemberSpacesWithMetadata } from "@app/lib/api/projects/list";
import { getPodRoute } from "@app/lib/utils/router";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mcpJsonResponse } from "../response";

export function registerPodsListTool(server: McpServer) {
  server.registerTool(
    "list_pods",
    {
      description:
        "List non-archived Pods that you are a member of in the current workspace.",
    },
    async () => {
      const auth = getAuthenticatorFromMcpContext();
      const owner = auth.workspace();
      const { nonArchivedSpaces } =
        await listNonArchivedMemberSpacesWithMetadata(auth);
      const memberPods = nonArchivedSpaces
        .filter((space) => space.isProject())
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        );

      const pods = memberPods.map((pod) => ({
        id: pod.sId,
        name: pod.name,
        url: `${config.getAppUrl()}${getPodRoute(owner.sId, pod.sId)}`,
      }));

      return mcpJsonResponse({
        count: pods.length,
        pods,
      });
    }
  );
}
