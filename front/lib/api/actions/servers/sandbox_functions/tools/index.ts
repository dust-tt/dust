import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { SANDBOX_FUNCTIONS_TOOLS_METADATA } from "@app/lib/api/actions/servers/sandbox_functions/metadata";
import { callHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/call";
import { dbListHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/db_list";
import { dbQueryHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/db_query";
import { dbReconcileHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/db_reconcile";
import { dbSchemaHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/db_schema";
import { getHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/get";
import { listHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/list";
import { publishHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/publish";

const HANDLERS = {
  list: listHandler,
  get: getHandler,
  publish: publishHandler,
  call: callHandler,
  db_list: dbListHandler,
  db_schema: dbSchemaHandler,
  db_query: dbQueryHandler,
  db_reconcile: dbReconcileHandler,
};

export const TOOLS = buildTools(SANDBOX_FUNCTIONS_TOOLS_METADATA, HANDLERS);
