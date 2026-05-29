import { buildSkillInstructionsExtensions } from "@app/lib/editor/build_skill_instructions_extensions";
import { preprocessMarkdownForEditor } from "@app/lib/editor/skill_instructions_preprocessing";
import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";

describe("skill instructions preprocessing", () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it("escapes skill tags by default", () => {
    expect(
      preprocessMarkdownForEditor(
        'Use <skill id="skill_123" name="Create memo" /> here.'
      )
    ).toContain("<\u200Bskill");
  });

  it("preserves skill tags when skill nodes are enabled", () => {
    editor = new Editor({
      extensions: buildSkillInstructionsExtensions(false, [], {
        includeSkillNode: true,
      }),
    });

    editor.commands.setContent(
      preprocessMarkdownForEditor(
        'Use <skill id="skill_123" name="Create memo" /> here.',
        { preserveSkillTags: true }
      ),
      {
        contentType: "markdown",
      }
    );

    const json = editor.getJSON();
    expect(JSON.stringify(json)).toContain('"type":"skill"');
    expect(JSON.stringify(json)).toContain('"skillId":"skill_123"');
    expect(JSON.stringify(json)).toContain('"skillName":"Create memo"');
    expect(editor.getMarkdown()).toContain(
      '<skill id="skill_123" name="Create memo" />'
    );
  });
});
