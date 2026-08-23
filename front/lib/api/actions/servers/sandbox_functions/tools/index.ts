import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { SANDBOX_FUNCTIONS_TOOLS_METADATA } from "@app/lib/api/actions/servers/sandbox_functions/metadata";
import { callHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/call";
import { dbListHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/db_list";
import { dbQueryHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/db_query";
import { dbSchemaHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/db_schema";
import { getHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/get";
import { inspectInvocationsHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/inspect_invocations";
import { listHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/list";
import { publishAppHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/publish_app";
import { unpublishHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/unpublish";

const HANDLERS = {
  list: listHandler,
  get: getHandler,
  publish_app: publishAppHandler,
  unpublish: unpublishHandler,
  call: callHandler,
  inspect_invocations: inspectInvocationsHandler,
  db_list: dbListHandler,
  db_schema: dbSchemaHandler,
  db_query: dbQueryHandler,
};

export const TOOLS = buildTools(SANDBOX_FUNCTIONS_TOOLS_METADATA, HANDLERS);
