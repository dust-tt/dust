import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  FILES_CAT_ACTION_NAME,
  FILES_COPY_ACTION_NAME,
  FILES_CREATE_ACTION_NAME,
  FILES_DELETE_ACTION_NAME,
  FILES_EXTRACT_TEXT_ACTION_NAME,
  FILES_GREP_ACTION_NAME,
  FILES_LIST_ACTION_NAME,
  FILES_MOVE_ACTION_NAME,
  FILES_RESOLVE_ACTION_NAME,
  FILES_TOOLS_METADATA,
  FILES_UPLOAD_FROM_URL_ACTION_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import { catHandler } from "@app/lib/api/actions/servers/files/tools/cat";
import { copyHandler } from "@app/lib/api/actions/servers/files/tools/copy";
import { createHandler } from "@app/lib/api/actions/servers/files/tools/create";
import { deleteHandler } from "@app/lib/api/actions/servers/files/tools/delete";
import { extractTextHandler } from "@app/lib/api/actions/servers/files/tools/extract_text";
import { grepHandler } from "@app/lib/api/actions/servers/files/tools/grep";
import { listHandler } from "@app/lib/api/actions/servers/files/tools/list";
import { moveHandler } from "@app/lib/api/actions/servers/files/tools/move";
import { resolveHandler } from "@app/lib/api/actions/servers/files/tools/resolve";
import { uploadFromUrlHandler } from "@app/lib/api/actions/servers/files/tools/upload_from_url";

const HANDLERS = {
  [FILES_CAT_ACTION_NAME]: catHandler,
  [FILES_COPY_ACTION_NAME]: copyHandler,
  [FILES_CREATE_ACTION_NAME]: createHandler,
  [FILES_UPLOAD_FROM_URL_ACTION_NAME]: uploadFromUrlHandler,
  [FILES_DELETE_ACTION_NAME]: deleteHandler,
  [FILES_EXTRACT_TEXT_ACTION_NAME]: extractTextHandler,
  [FILES_GREP_ACTION_NAME]: grepHandler,
  [FILES_LIST_ACTION_NAME]: listHandler,
  [FILES_MOVE_ACTION_NAME]: moveHandler,
  [FILES_RESOLVE_ACTION_NAME]: resolveHandler,
};

export const TOOLS = buildTools(FILES_TOOLS_METADATA, HANDLERS);
