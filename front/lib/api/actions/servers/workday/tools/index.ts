import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { withAuth } from "@app/lib/api/actions/servers/workday/helpers";
import { WORKDAY_TOOLS_METADATA } from "@app/lib/api/actions/servers/workday/metadata";
import { untrustedFetch } from "@app/lib/egress/server";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

const WorkersResponseSchema = z.object({
  total: z.number(),
  data: z.array(
    z.object({
      id: z.string(),
      descriptor: z.string(),
    })
  ),
});

const handlers: ToolHandlers<typeof WORKDAY_TOOLS_METADATA> = {
  get_workers: async ({ limit }, extra) =>
    withAuth(extra, async (accessToken, apiBaseUrl) => {
      const url = new URL(`${apiBaseUrl}/workers`);
      url.searchParams.set("limit", String(limit ?? 20));

      const response = await untrustedFetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        return new Err(
          new MCPError(
            `Workday API error: ${response.status} ${response.statusText} - ${await response.text()}`
          )
        );
      }

      const parsed = WorkersResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        return new Err(
          new MCPError(
            `Invalid Workday /workers response: ${parsed.error.message}`
          )
        );
      }

      const { total, data } = parsed.data;
      if (data.length === 0) {
        return new Ok([{ type: "text" as const, text: "No workers found." }]);
      }

      const lines = data.map(
        (worker) => `- ${worker.descriptor} (id: ${worker.id})`
      );
      return new Ok([
        {
          type: "text" as const,
          text: `Found ${total} worker(s). Showing ${data.length}:\n${lines.join("\n")}`,
        },
      ]);
    }),
};

export const TOOLS = buildTools(WORKDAY_TOOLS_METADATA, handlers);
