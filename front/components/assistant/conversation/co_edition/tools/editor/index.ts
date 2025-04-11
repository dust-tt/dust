import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Editor } from "@tiptap/react";

import { registerDeleteNodeTool } from "@app/components/assistant/conversation/co_edition/tools/editor/delete_node";
import { registerGetEditorContentTool } from "@app/components/assistant/conversation/co_edition/tools/editor/get_editor_content";
import { registerInsertNodeTool } from "@app/components/assistant/conversation/co_edition/tools/editor/insert_node";
import { registerReplaceNodeTool } from "@app/components/assistant/conversation/co_edition/tools/editor/replace_node";
import { registerReplaceTextRangeTool } from "@app/components/assistant/conversation/co_edition/tools/editor/replace_text_range";

export function registerEditorTools(server: McpServer, editor: Editor) {
  registerGetEditorContentTool(server, editor);

  registerDeleteNodeTool(server, editor);
  registerInsertNodeTool(server, editor);
  registerReplaceNodeTool(server, editor);
  registerReplaceTextRangeTool(server, editor);
}
