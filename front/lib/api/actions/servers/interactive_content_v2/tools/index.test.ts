import type { ToolContext } from "@app/lib/actions/types";
import { EXPORT_INTERACTIVE_CONTENT_FILE_TOOL_NAME } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { createInteractiveContentV2Tools } from "@app/lib/api/actions/servers/interactive_content_v2/tools";
import {
  makeExtra,
  setupPlainConversation,
} from "@app/tests/utils/conversation_test_factories";
import { describe, expect, it } from "vitest";

describe("createInteractiveContentV2Tools", () => {
  it("exposes only PNG and PDF export", async () => {
    const { auth, conversation } = await setupPlainConversation();
    const extra = makeExtra(auth, conversation);
    const toolContext: ToolContext = { runContext: extra.runContext };
    const v2Tools = await createInteractiveContentV2Tools(auth, toolContext);

    expect(v2Tools.map((tool) => tool.name)).toEqual([
      EXPORT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    ]);
  });
});
