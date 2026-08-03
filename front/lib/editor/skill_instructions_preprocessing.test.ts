import { buildSkillInstructionsExtensions } from "@app/lib/editor/build_skill_instructions_extensions";
import {
  postProcessMarkdown,
  preprocessMarkdownForEditor,
} from "@app/lib/editor/skill_instructions_preprocessing";
import { serializeToolTag } from "@app/lib/tools/format";
import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";

describe("skill instructions preprocessing", () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it("preserves skill tags", () => {
    editor = new Editor({
      extensions: buildSkillInstructionsExtensions(false),
    });

    editor.commands.setContent(
      preprocessMarkdownForEditor(
        'Use <skill id="skill_123" name="Create memo" /> here.'
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

  it("keeps escaped tool attributes when post-processing editor markdown", () => {
    const toolTag = serializeToolTag({
      icon: "GithubLogo",
      id: "mcp_server_view_123",
      name: 'GitHub & "Issues" <Prod>',
    });

    editor = new Editor({
      extensions: buildSkillInstructionsExtensions(false),
    });

    editor.commands.setContent(preprocessMarkdownForEditor(`Use ${toolTag}.`), {
      contentType: "markdown",
    });

    expect(postProcessMarkdown(editor.getMarkdown())).toContain(toolTag);
  });

  it("preserves unavailable skill tags", () => {
    editor = new Editor({
      extensions: buildSkillInstructionsExtensions(false),
    });

    editor.commands.setContent(
      preprocessMarkdownForEditor(
        'Use <unavailable_skill id="skill_123" /> here.'
      ),
      {
        contentType: "markdown",
      }
    );

    const json = editor.getJSON();
    expect(JSON.stringify(json)).toContain('"type":"skill"');
    expect(JSON.stringify(json)).toContain('"skillId":"skill_123"');
    expect(JSON.stringify(json)).toContain('"skillUnavailable":true');
    expect(editor.getMarkdown()).toContain(
      '<unavailable_skill id="skill_123" />'
    );
  });
});
