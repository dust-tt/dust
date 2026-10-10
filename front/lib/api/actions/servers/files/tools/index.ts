import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  FILES_CAT_ACTION_NAME,
  FILES_COPY_ACTION_NAME,
  FILES_CREATE_ACTION_NAME,
  FILES_DELETE_ACTION_NAME,
  FILES_EDIT_ACTION_NAME,
  FILES_EXTRACT_TEXT_ACTION_NAME,
  FILES_GREP_ACTION_NAME,
  FILES_LIST_ACTION_NAME,
  FILES_MOVE_ACTION_NAME,
  FILES_RESOLVE_ACTION_NAME,
  FILES_TOOLS_METADATA,
  FILES_UPLOAD_FROM_URL_ACTION_NAME,
  filesEditToolDescription,
} from "@app/lib/api/actions/servers/files/metadata";
import { catHandler } from "@app/lib/api/actions/servers/files/tools/cat";
import { copyHandler } from "@app/lib/api/actions/servers/files/tools/copy";
import { createHandler } from "@app/lib/api/actions/servers/files/tools/create";
import { deleteHandler } from "@app/lib/api/actions/servers/files/tools/delete";
import { editHandler } from "@app/lib/api/actions/servers/files/tools/edit";
import { extractTextHandler } from "@app/lib/api/actions/servers/files/tools/extract_text";
import { grepHandler } from "@app/lib/api/actions/servers/files/tools/grep";
import { listHandler } from "@app/lib/api/actions/servers/files/tools/list";
import { moveHandler } from "@app/lib/api/actions/servers/files/tools/move";
import { resolveHandler } from "@app/lib/api/actions/servers/files/tools/resolve";
import { uploadFromUrlHandler } from "@app/lib/api/actions/servers/files/tools/upload_from_url";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";

const HANDLERS = {
  [FILES_CAT_ACTION_NAME]: catHandler,
  [FILES_COPY_ACTION_NAME]: copyHandler,
  [FILES_CREATE_ACTION_NAME]: createHandler,
  [FILES_EDIT_ACTION_NAME]: editHandler,
  [FILES_UPLOAD_FROM_URL_ACTION_NAME]: uploadFromUrlHandler,
  [FILES_DELETE_ACTION_NAME]: deleteHandler,
  [FILES_EXTRACT_TEXT_ACTION_NAME]: extractTextHandler,
  [FILES_GREP_ACTION_NAME]: grepHandler,
  [FILES_LIST_ACTION_NAME]: listHandler,
  [FILES_MOVE_ACTION_NAME]: moveHandler,
  [FILES_RESOLVE_ACTION_NAME]: resolveHandler,
};

/**
 * @cc [owner:flvndvd,label:product;mcp] extraction-follows-computer-availability
 * When the workspace Computer feature is enabled, files.extract_text MUST be
 * omitted in favor of the document skills. When disabled, it MUST remain available.
 * Other files tools MUST remain available in both cases.
 */
/**
 * @cc [owner:davidebbo,label:product;mcp] edit-description-follows-frames-v2
 * The files.edit description MUST be `filesEditToolDescription(hasFramesV2)` for the workspace's
 * effective `frames_v2` flag, so it never points to a Frame tool the workspace does not serve.
 */
export async function createFilesTools(auth: Authenticator) {
  const flags = await getFeatureFlags(auth);
  const hasFramesV2 = flags.includes("frames_v2");
  const tools = buildTools(FILES_TOOLS_METADATA, HANDLERS).map((tool) =>
    tool.name === FILES_EDIT_ACTION_NAME
      ? { ...tool, description: filesEditToolDescription(hasFramesV2) }
      : tool
  );

  return isComputerFeatureEnabled(flags)
    ? tools.filter((tool) => tool.name !== FILES_EXTRACT_TEXT_ACTION_NAME)
    : tools;
}
