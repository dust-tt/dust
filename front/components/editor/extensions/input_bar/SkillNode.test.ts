import {
  SkillNode,
  serializeSkillNodeClipboardHTML,
} from "@app/components/editor/extensions/input_bar/SkillNode";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";
import { cleanupPastedHTML } from "@app/components/editor/input_bar/cleanupPastedHTML";
import type { Editor } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("SkillNode clipboard HTML", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory([SkillNode]);
  });

  afterEach(() => {
    editor.destroy();
  });

  it("parses a pasted skill back into a skill node", () => {
    const html = serializeSkillNodeClipboardHTML({
      skillId: "skl_123",
      skillName: "Deep Research",
      skillIcon: "ActionMagnifyingGlassIcon",
    });

    editor.commands.setContent(cleanupPastedHTML(html));

    expect(editor.getJSON().content?.[0].content).toEqual([
      {
        type: "skill",
        attrs: {
          skillId: "skl_123",
          skillName: "Deep Research",
          skillIcon: "ActionMagnifyingGlassIcon",
          skillUnavailable: false,
        },
      },
    ]);
  });
});
