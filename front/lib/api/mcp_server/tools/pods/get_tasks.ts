import { getAuthenticatorFromMcpContext } from "@app/lib/api/mcp_server/context";
import { listNonArchivedMemberSpacesWithMetadata } from "@app/lib/api/projects/list";
import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mcpError, mcpJsonResponse } from "../response";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const inputSchema = {
  podId: z.string().describe("Pod id to list tasks for."),
  assigneeFilter: z
    .enum(["mine", "all"])
    .optional()
    .describe(
      "Which tasks to return. 'mine' = only the current user's tasks; 'all' = all tasks (default)."
    ),
  statusFilter: z
    .enum(["open", "done", "all"])
    .optional()
    .describe(
      "Which tasks to return. 'open' = not done + in_progress (default); 'done' = completed; 'all' = everything."
    ),
  daysAgo: z
    .number()
    .min(1)
    .max(90)
    .optional()
    .describe(
      "When statusFilter is 'done' or 'all', limit completed tasks to this many days back. Defaults to 7."
    ),
};

export function registerPodsGetTasksTool(server: McpServer) {
  server.registerTool(
    "get_pod_tasks",
    {
      description:
        "List tasks in a Pod. Defaults to all assignees and open tasks. Use statusFilter='done' or 'all' with daysAgo to include recently completed tasks.",
      inputSchema,
    },
    async ({
      podId,
      assigneeFilter = "all",
      statusFilter = "open",
      daysAgo = 7,
    }) => {
      const auth = getAuthenticatorFromMcpContext();

      const { nonArchivedSpaces } =
        await listNonArchivedMemberSpacesWithMetadata(auth);
      const pod = nonArchivedSpaces.find(
        (space) => space.isProject() && space.sId === podId
      );

      if (!pod) {
        return mcpError("Pod not found or you do not have access.");
      }

      let rows: ProjectTaskResource[] = [];

      if (assigneeFilter === "mine") {
        rows = await ProjectTaskResource.fetchLatestBySpace(auth, {
          spaceId: pod.id,
        });
      } else {
        rows = await ProjectTaskResource.fetchBySpace(auth, {
          spaceId: pod.id,
          timeScope: "all",
        });
      }

      const cutoff = new Date(Date.now() - daysAgo * MS_PER_DAY);

      if (statusFilter === "open") {
        rows = rows.filter((task) => task.status !== "done");
      } else if (statusFilter === "done") {
        rows = rows.filter(
          (task) =>
            task.status === "done" &&
            task.doneAt !== null &&
            task.doneAt >= cutoff
        );
      } else {
        rows = rows.filter(
          (task) =>
            task.status !== "done" ||
            (task.doneAt !== null && task.doneAt >= cutoff)
        );
      }

      if (statusFilter === "done") {
        rows.sort(
          (a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0)
        );
      }

      return mcpJsonResponse({
        count: rows.length,
        podId: pod.sId,
        podName: pod.name,
        assigneeFilter,
        statusFilter,
        daysAgo,
        tasks: rows.map((task) => task.toJSON()),
      });
    }
  );
}
