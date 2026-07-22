import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  listWarehouses,
  renderWarehouse,
  withAuth,
} from "@app/lib/api/actions/servers/databricks/helpers";
import type { DATABRICKS_TOOLS_METADATA } from "@app/lib/api/actions/servers/databricks/metadata";
import { Ok } from "@app/types/shared/result";

export const DATABRICKS_TOOL_HANDLERS: ToolHandlers<
  typeof DATABRICKS_TOOLS_METADATA
> = {
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
