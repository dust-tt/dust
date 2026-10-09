import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  FILES_RESOLVE_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import { markdownDocumentsSkill } from "@app/lib/resources/skill/code_defined/global/markdown_documents";
import { describe, expect, it } from "vitest";

describe("markdownDocumentsSkill", () => {
  it("is offered in every agent run", () => {
    expect(markdownDocumentsSkill.getAutoEnabledOrEquippedForAgentLoop()).toBe(
      "equipped"
    );
  });

  it("explains how to embed an image by its file path", () => {
    expect(markdownDocumentsSkill.instructions).toContain(
      "![Revenue by quarter](pod-<id>/charts/revenue.png)"
    );
    expect(markdownDocumentsSkill.instructions).toContain(
      getPrefixedToolName(FILES_SERVER_NAME, FILES_RESOLVE_ACTION_NAME)
    );
  });
});
