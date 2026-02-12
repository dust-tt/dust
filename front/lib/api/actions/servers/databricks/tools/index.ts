import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  listWarehouses,
  renderWarehouse,
  withAuth,
} from "@app/lib/api/actions/servers/databricks/helpers";
import { DATABRICKS_TOOLS_METADATA } from "@app/lib/api/actions/servers/databricks/metadata";
import { Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof DATABRICKS_TOOLS_METADATA> = {
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  list_warehouses: async (_params, { authInfo }) => {
    return withAuth({
      authInfo,
      action: async (accessToken, workspaceUrl) => {
        const result = await listWarehouses(accessToken, workspaceUrl);

        if (result.isErr()) {
          return result;
        }

        const warehouses = result.value;

        if (warehouses.length === 0) {
          return new Ok([
            { type: "text" as const, text: "No SQL warehouses found." },
          ]);
        }

        let text = `Found ${warehouses.length} SQL warehouse(s):\n\n`;
        for (const warehouse of warehouses) {
          text += renderWarehouse(warehouse);
        }

        return new Ok([{ type: "text" as const, text }]);
      },
    });
  },
};

export const TOOLS = buildTools(DATABRICKS_TOOLS_METADATA, handlers);
