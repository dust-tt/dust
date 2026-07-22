import { callHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/call";
import { dbListHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/db_list";
import { dbQueryHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/db_query";
import { dbReconcileHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/db_reconcile";
import { dbSchemaHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/db_schema";
import { getHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/get";
import { inspectInvocationsHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/inspect_invocations";
import { listHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/list";
import { publishHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/publish";

export const SANDBOX_FUNCTIONS_TOOL_HANDLERS = {
  list: listHandler,
  get: getHandler,
  publish: publishHandler,
  call: callHandler,
  inspect_invocations: inspectInvocationsHandler,
  db_list: dbListHandler,
  db_schema: dbSchemaHandler,
  db_query: dbQueryHandler,
  db_reconcile: dbReconcileHandler,
};
