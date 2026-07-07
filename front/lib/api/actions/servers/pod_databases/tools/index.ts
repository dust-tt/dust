import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { POD_DATABASES_TOOLS_METADATA } from "@app/lib/api/actions/servers/pod_databases/metadata";
import { getSchemaHandler } from "@app/lib/api/actions/servers/pod_databases/tools/get_schema";
import { listDatabasesHandler } from "@app/lib/api/actions/servers/pod_databases/tools/list_databases";
import { queryHandler } from "@app/lib/api/actions/servers/pod_databases/tools/query";

const HANDLERS = {
  list_databases: listDatabasesHandler,
  get_schema: getSchemaHandler,
  query: queryHandler,
};

export const TOOLS = buildTools(POD_DATABASES_TOOLS_METADATA, HANDLERS);
