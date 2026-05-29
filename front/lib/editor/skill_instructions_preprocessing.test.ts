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

  it("escapes skill tags by default", () => {
    expect(
      preprocessMarkdownForEditor(
        'Use <skill id="skill_123" name="Create memo" /> here.'
      )
    ).toContain("<\u200Bskill");
  });

  it("escapes tool tags by default", () => {
    expect(
      preprocessMarkdownForEditor(
        '<tool id="mcp_server_view_123" name="GitHub Search" />'
      )
    ).toContain("<\u200Btool");
  });

  it("preserves skill tags when skill references are enabled", () => {
    editor = new Editor({
      extensions: buildSkillInstructionsExtensions(false, [], {
        enableSkillReferences: true,
      }),
    });

    editor.commands.setContent(
      preprocessMarkdownForEditor(
        'Use <skill id="skill_123" name="Create memo" /> here.',
        { enableSkillReferences: true }
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
      extensions: buildSkillInstructionsExtensions(false, [], {
        enableSkillReferences: true,
      }),
    });

    editor.commands.setContent(
      preprocessMarkdownForEditor(`Use ${toolTag}.`, {
        enableSkillReferences: true,
      }),
      {
        contentType: "markdown",
      }
    );

    expect(postProcessMarkdown(editor.getMarkdown())).toContain(toolTag);
  });

  it("preserves unavailable skill tags when skill references are enabled", () => {
    editor = new Editor({
      extensions: buildSkillInstructionsExtensions(false, [], {
        enableSkillReferences: true,
      }),
    });

    editor.commands.setContent(
      preprocessMarkdownForEditor(
        'Use <unavailable_skill id="skill_123" /> here.',
        { enableSkillReferences: true }
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
