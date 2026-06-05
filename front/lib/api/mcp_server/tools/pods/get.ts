import { isContentNodeAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import config from "@app/lib/api/config";
import { DustFileSystem, SCOPED_PREFIX_POD } from "@app/lib/api/file_system";
import { getAuthenticatorFromMcpContext } from "@app/lib/api/mcp_server/context";
import { listProjectContextAttachments } from "@app/lib/api/projects/context";
import { listNonArchivedMemberSpacesWithMetadata } from "@app/lib/api/projects/list";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { getPodRoute } from "@app/lib/utils/router";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mcpError, mcpJsonResponse } from "../response";

const inputSchema = {
  podId: z.string().describe("Pod id to fetch information for."),
};

export function registerPodsGetTool(server: McpServer) {
  server.registerTool(
    "get_pod",
    {
      description:
        "Get information about a Pod: title, description, URL, pinned frame, linked content nodes, and file count.",
      inputSchema,
    },
    async ({ podId }) => {
      const auth = getAuthenticatorFromMcpContext();
      const owner = auth.workspace();
      const { nonArchivedSpaces } =
        await listNonArchivedMemberSpacesWithMetadata(auth);
      const pod = nonArchivedSpaces.find(
        (space) => space.isProject() && space.sId === podId
      );

      if (!pod) {
        return mcpError("Pod not found or you do not have access.");
      }

      const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
      const attachments = await listProjectContextAttachments(auth, pod);
      const contentNodes = attachments
        .filter(isContentNodeAttachmentType)
        .map((node) => ({
          name: node.title,
          nodeId: node.nodeId,
          dataSourceViewId: node.nodeDataSourceViewId,
        }));

      const fsResult = await DustFileSystem.forPod(auth, pod);
      if (fsResult.isErr()) {
        return mcpError("Failed to initialise file system for this Pod.");
      }
      const podFiles = await fsResult.value.list(
        `${SCOPED_PREFIX_POD}${pod.sId}`
      );
      const fileCount = podFiles.filter((entry) => !entry.isDirectory).length;

      return mcpJsonResponse({
        pod: {
          id: pod.sId,
          name: pod.name,
          url: `${config.getAppUrl()}${getPodRoute(owner.sId, pod.sId)}`,
          description: metadata?.description ?? null,
          pinnedFramePath: metadata?.pinnedFramePath ?? null,
          contentNodes,
          fileCount,
        },
      });
    }
  );
}
