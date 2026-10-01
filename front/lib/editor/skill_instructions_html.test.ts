// @vitest-environment node: the server has no DOM globals, jsdom must not hide a reliance on them.

import { getMarkdownPipeline } from "@app/lib/editor/server_markdown_pipeline";
import {
  applyInstructionEditsToHtml,
  convertBlockHtmlToMarkdown,
  convertMarkdownToBlockHtml,
} from "@app/lib/editor/skill_instructions_html";
import { extractUniqueSkillReferenceIds } from "@app/lib/skills/format";
import { setupSkillInstructionsMarkdownPipeline } from "@app/tests/utils/skill_instructions_html";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";

setupSkillInstructionsMarkdownPipeline();
const pipeline = getMarkdownPipeline("skill");

const HEX_BLOCK_ID = /^[a-f0-9]{8}$/;

function load(html: string) {
  return cheerio.load(html, { xmlMode: false }, false);
}

function blockIds(html: string): string[] {
  return [...html.matchAll(/data-block-id="([^"]+)"/g)].map((m) => m[1]);
}

describe("convertMarkdownToBlockHtml", () => {
  it("wraps content in instructions root with stable root block id", () => {
    const html = convertMarkdownToBlockHtml("Hello", pipeline);
    const $ = load(html);

    const root = $(`div[data-type="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"]`);
    expect(root).toHaveLength(1);
    expect(root.attr("data-block-id")).toBe(INSTRUCTIONS_ROOT_TARGET_BLOCK_ID);
  });

  it("assigns 8-char hex block ids to block nodes (paragraph + heading)", () => {
    const html = convertMarkdownToBlockHtml("# Title\n\nBody", pipeline);
    const $ = load(html);

    const withId = $("[data-block-id]")
      .map((_, el) => $(el).attr("data-block-id"))
      .get()
      .filter(Boolean);

    expect(withId).toContain(INSTRUCTIONS_ROOT_TARGET_BLOCK_ID);

    const nonRootIds = withId.filter(
      (id) => id !== INSTRUCTIONS_ROOT_TARGET_BLOCK_ID
    );
    expect(nonRootIds).toHaveLength(2);
    for (const id of nonRootIds) {
      expect(id).toMatch(HEX_BLOCK_ID);
    }
    expect(new Set(nonRootIds).size).toBe(2);
  });

  it("strips class, style, and id from rendered HTML", () => {
    const html = convertMarkdownToBlockHtml("- Item\n\nParagraph", pipeline);
    const $ = load(html);

    expect($("[class]").length).toBe(0);
    expect($("[style]").length).toBe(0);
    expect($("[id]").length).toBe(0);
  });

  it("preserves semantic tags and data-block-id while stripping presentation attrs", () => {
    const html = convertMarkdownToBlockHtml(
      "## Section\n\n[Link](https://example.com)",
      pipeline
    );
    const $ = load(html);

    expect($("h2").length).toBe(1);
    expect($("h2").attr("data-block-id")).toMatch(HEX_BLOCK_ID);
    expect($("p a[href='https://example.com']").length).toBe(1);
    expect($("a[class]").length).toBe(0);
  });

  it("puts block ids on list containers for bullet and ordered lists", () => {
    const bullet = convertMarkdownToBlockHtml("- one\n- two", pipeline);
    const $b = load(bullet);
    expect($b("ul").length).toBe(1);
    expect($b("ul").attr("data-block-id")).toMatch(HEX_BLOCK_ID);

    const ordered = convertMarkdownToBlockHtml("1. first\n2. second", pipeline);
    const $o = load(ordered);
    expect($o("ol").length).toBe(1);
    expect($o("ol").attr("data-block-id")).toMatch(HEX_BLOCK_ID);
  });

  it("uses empty paragraph when markdown is empty or whitespace-only", () => {
    for (const input of ["", "   ", "\n\t\n"]) {
      const html = convertMarkdownToBlockHtml(input, pipeline);
      const $ = load(html);

      expect($("p").length).toBeGreaterThanOrEqual(1);
      expect(
        $(`div[data-type="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"]`).length
      ).toBe(1);
    }
  });

  it("produces valid nested structure: root > blocks without extra wrappers", () => {
    const html = convertMarkdownToBlockHtml("Line", pipeline);
    const $ = load(html);

    const root = $(
      `div[data-type="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"]`
    ).first();
    expect(root.children("p").length).toBe(1);
    expect(root.find("p").first().text()).toContain("Line");
  });

  it("handles fenced code blocks and strips classes from pre only", () => {
    const html = convertMarkdownToBlockHtml("```\nconst x = 1\n```", pipeline);
    const $ = load(html);

    expect($("pre").length).toBe(1);
    expect($("pre code, code").length).toBeGreaterThanOrEqual(1);
    expect($("pre[class]").length).toBe(0);
  });

  it("renders inline emphasis and strong without presentation attributes on spans", () => {
    const html = convertMarkdownToBlockHtml(
      "Some *italic* and **bold** text.",
      pipeline
    );
    const $ = load(html);

    expect($("em").length).toBe(1);
    expect($("strong").length).toBe(1);
    expect($("em[class], strong[class]").length).toBe(0);
  });

  it("recovers standalone <knowledge /> lines as knowledge nodes (not HTML-escaped text)", () => {
    const md = [
      "Intro",
      "",
      '<knowledge id="n1" title="My Doc" space="sp1" dsv="dsv1" hasChildren="false" />',
      "",
      "Outro",
    ].join("\n");

    const html = convertMarkdownToBlockHtml(md, pipeline);

    expect(html).not.toContain("&lt;knowledge");
    expect(html).toContain("<knowledge");
    expect(html).toContain('id="n1"');
    expect(html).toContain('title="My Doc"');
  });

  it("recovers standalone <tool /> lines as tool nodes with id, name, and icon", () => {
    const md = [
      "Intro",
      "",
      '<tool id="mcp_server_view_1" name="GitHub Search" icon="GithubLogo" />',
      "",
      "Outro",
    ].join("\n");

    const html = convertMarkdownToBlockHtml(md, pipeline);

    expect(html).not.toContain("&lt;tool");
    expect(html).toContain("<tool");
    expect(html).toContain('id="mcp_server_view_1"');
    expect(html).toContain('name="GitHub Search"');
    expect(html).toContain('icon="GithubLogo"');
  });

  it("renders inline <skill /> references as skill nodes (not HTML-escaped text)", () => {
    const md =
      '<skill id="skl_abc" name="Talk Like a Pirate" icon="ActionSpeakIcon" /> when in doubt';

    const html = convertMarkdownToBlockHtml(md, pipeline);
    const $ = load(html);

    expect(html).not.toContain("&lt;skill");

    const skill = $("skill");
    expect(skill).toHaveLength(1);
    expect(skill.attr("id")).toBe("skl_abc");
    expect(skill.attr("name")).toBe("Talk Like a Pirate");
    expect(skill.attr("icon")).toBe("ActionSpeakIcon");
    // The boolean parse-only attribute must not leak into the HTML.
    expect(skill.attr("skillunavailable")).toBeUndefined();

    // The skill must serialize as an empty paired tag (`<skill ...></skill>`),
    // never self-closing and never with a child element. This is the form the
    // rename / availability reconciliation regex matches; a child would break it
    // and silently desync instructionsHtml from the markdown instructions.
    expect(skill.children().length).toBe(0);
    expect(skill.text()).toBe("");
    expect(extractUniqueSkillReferenceIds(html)).toEqual(["skl_abc"]);

    // The trailing text must remain a sibling of the skill node, not get
    // swallowed inside a self-closed <skill> element.
    const paragraph = skill.parent("p");
    expect(paragraph).toHaveLength(1);
    expect(paragraph.text()).toContain("when in doubt");
  });

  it("recovers standalone <skill /> lines as skill nodes with id, name, and icon", () => {
    const md = [
      "Intro",
      "",
      '<skill id="skl_def" name="Triage Support" icon="ActionListIcon" />',
      "",
      "Outro",
    ].join("\n");

    const html = convertMarkdownToBlockHtml(md, pipeline);

    expect(html).not.toContain("&lt;skill");
    expect(html).toContain("<skill");
    expect(html).toContain('id="skl_def"');
    expect(html).toContain('name="Triage Support"');
    expect(html).toContain('icon="ActionListIcon"');
  });

  it("renders <unavailable_skill /> references preserving the id and keeping trailing text", () => {
    const md = '<unavailable_skill id="skl_gone" /> for legacy callers';

    const html = convertMarkdownToBlockHtml(md, pipeline);
    const $ = load(html);

    expect(html).not.toContain("&lt;unavailable_skill");

    const skill = $("unavailable_skill");
    expect(skill).toHaveLength(1);
    expect(skill.attr("id")).toBe("skl_gone");

    // Empty paired tag: no chip child, no "Unavailable skill" label leaking into
    // the stored HTML (and, downstream, into the model prompt).
    expect(skill.children().length).toBe(0);
    expect(skill.text()).toBe("");
    expect(extractUniqueSkillReferenceIds(html)).toEqual(["skl_gone"]);

    expect(skill.parent("p").text()).toContain("for legacy callers");
  });

  it("escapes HTML special characters in text exactly once", () => {
    const md = 'Say "hi" & <role> > then stop.';

    const html = convertMarkdownToBlockHtml(md, pipeline);

    expect(load(html)("p").text()).toBe(md);
    expect(html).toContain("&lt;role&gt;");
    expect(html).not.toContain("&amp;lt;");
    expect(html).not.toContain("&amp;amp;");
    expect(html).not.toContain("&amp;quot;");
    expect(convertBlockHtmlToMarkdown(html, pipeline)).toBe(md);
  });

  it("round-trips raw markdown blocks holding HTML special characters", () => {
    const md = '| "quoted" | <tag> & co |\n|---|---|\n| 1 | 2 |';

    const html = convertMarkdownToBlockHtml(md, pipeline);

    expect(load(html)("div[data-raw-markdown]").attr("data-content")).toBe(md);
    expect(convertBlockHtmlToMarkdown(html, pipeline)).toBe(md);
  });
});

describe("applyInstructionEditsToHtml", () => {
  it("replaces one block and leaves its siblings untouched", () => {
    const html = convertMarkdownToBlockHtml(
      "First para\n\nSecond para",
      pipeline
    );
    const [, firstId, secondId] = blockIds(html);

    const result = applyInstructionEditsToHtml(
      html,
      [{ targetBlockId: secondId, content: "<p>Rewritten para</p>" }],
      pipeline
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.instructions).toContain("First para");
      expect(result.value.instructions).toContain("Rewritten para");
      expect(result.value.instructions).not.toContain("Second para");
      // Same node type, so the block keeps its id and the untouched sibling keeps its own.
      expect(blockIds(result.value.instructionsHtml)).toContain(firstId);
      expect(blockIds(result.value.instructionsHtml)).toContain(secondId);
    }
  });

  it("applies several edits targeting different blocks in one pass", () => {
    const html = convertMarkdownToBlockHtml(
      "Alpha\n\nBravo\n\nCharlie",
      pipeline
    );
    const [, alphaId, , charlieId] = blockIds(html);

    const result = applyInstructionEditsToHtml(
      html,
      [
        { targetBlockId: alphaId, content: "<p>Alpha edited</p>" },
        { targetBlockId: charlieId, content: "<p>Charlie edited</p>" },
      ],
      pipeline
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.instructions).toContain("Alpha edited");
      expect(result.value.instructions).toContain("Bravo");
      expect(result.value.instructions).toContain("Charlie edited");
    }
  });

  it("replaces one block with several", () => {
    const html = convertMarkdownToBlockHtml("Only para", pipeline);
    const [, onlyId] = blockIds(html);

    const result = applyInstructionEditsToHtml(
      html,
      [{ targetBlockId: onlyId, content: "<p>One</p><p>Two</p>" }],
      pipeline
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.instructions).toContain("One");
      expect(result.value.instructions).toContain("Two");
      expect(result.value.instructions).not.toContain("Only para");
    }
  });

  it("rewrites everything when targeting the root", () => {
    const html = convertMarkdownToBlockHtml("Old one\n\nOld two", pipeline);

    const result = applyInstructionEditsToHtml(
      html,
      [
        {
          targetBlockId: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
          content: `<div data-type="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"><p>Brand new</p></div>`,
        },
      ],
      pipeline
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.instructions).toContain("Brand new");
      expect(result.value.instructions).not.toContain("Old one");
      expect(result.value.instructions).not.toContain("Old two");
    }
  });

  it("changes the block type when the edit does", () => {
    const html = convertMarkdownToBlockHtml("Plain para", pipeline);
    const [, paraId] = blockIds(html);

    const result = applyInstructionEditsToHtml(
      html,
      [{ targetBlockId: paraId, content: "<h2>Now a heading</h2>" }],
      pipeline
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.instructionsHtml).toContain("<h2");
      expect(result.value.instructions).toContain("Now a heading");
    }
  });

  it("mints fresh ids instead of keeping the ones in the edit's content", () => {
    const html = convertMarkdownToBlockHtml("Alpha\n\nBravo", pipeline);
    const [, alphaId, bravoId] = blockIds(html);

    // The tool asks the model for the block "including the wrapping tag", so edit content
    // routinely repeats a `data-block-id` — here one that another block already uses.
    const result = applyInstructionEditsToHtml(
      html,
      [
        {
          targetBlockId: alphaId,
          content: `<p data-block-id="${bravoId}">One</p><p data-block-id="${bravoId}">Two</p>`,
        },
      ],
      pipeline
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const ids = blockIds(result.value.instructionsHtml);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("correctly applies an edit holding a self-closing <knowledge/> tag", () => {
    const html = convertMarkdownToBlockHtml("First para", pipeline);
    const [, firstId] = blockIds(html);

    const result = applyInstructionEditsToHtml(
      html,
      [
        {
          targetBlockId: firstId,
          content:
            '<p>See <knowledge id="n1" title="My Doc" space="sp1" dsv="dsv1" hasChildren="false" /> then stop.</p>',
        },
      ],
      pipeline
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.instructions).toBe(
        'See <knowledge id="n1" title="My Doc" space="sp1" dsv="dsv1" hasChildren="false" /> then stop.'
      );
    }
  });

  it("correctly applies an edit holding a self-closing <skill/> tag", () => {
    const html = convertMarkdownToBlockHtml("First para", pipeline);
    const [, firstId] = blockIds(html);

    const result = applyInstructionEditsToHtml(
      html,
      [
        {
          targetBlockId: firstId,
          content:
            '<p>Use <skill id="skl_abc" name="Pirate" icon="ActionSpeakIcon" /> then stop.</p>',
        },
      ],
      pipeline
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.instructions).toBe(
        'Use <skill id="skl_abc" name="Pirate" icon="ActionSpeakIcon" /> then stop.'
      );
    }
  });

  it("correctly applies an edit holding a self-closing <tool/> tag", () => {
    const html = convertMarkdownToBlockHtml("First para", pipeline);
    const [, firstId] = blockIds(html);

    const result = applyInstructionEditsToHtml(
      html,
      [
        {
          targetBlockId: firstId,
          content:
            '<p>Use <tool id="msv_abc123" name="Web search" /> then stop.</p>',
        },
      ],
      pipeline
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.instructions).toBe(
        'Use <tool id="msv_abc123" name="Web search" /> then stop.'
      );
    }
  });

  it("keeps trailing text when a self-closing tag holds a literal '>' in an attribute", () => {
    const html = convertMarkdownToBlockHtml("First para", pipeline);
    const [, firstId] = blockIds(html);

    const result = applyInstructionEditsToHtml(
      html,
      [
        {
          targetBlockId: firstId,
          content:
            '<p>Use <skill id="skl_abc" name="A > B" icon="ActionSpeakIcon" /> then stop.</p>',
        },
      ],
      pipeline
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.instructions).toBe(
        'Use <skill id="skl_abc" name="A > B" icon="ActionSpeakIcon" /> then stop.'
      );
    }
  });

  it("keeps HTML special characters escaped once in edited and untouched blocks", () => {
    const html = convertMarkdownToBlockHtml(
      '<role>\n\nyou say hello\n\n</role>\n\n| "quoted" | <tag> |\n|---|---|\n| 1 | 2 |',
      pipeline
    );
    const [, , helloId] = blockIds(html);

    const result = applyInstructionEditsToHtml(
      html,
      [
        {
          targetBlockId: helloId,
          content: '<p>You say "hello" &amp; &lt;wave&gt;.</p>',
        },
      ],
      pipeline
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const { instructions, instructionsHtml } = result.value;
      expect(instructions).toBe(
        '<role>\n\nYou say "hello" & <wave>.\n\n</role>\n\n| "quoted" | <tag> |\n|---|---|\n| 1 | 2 |'
      );
      expect(instructionsHtml).not.toContain("&amp;lt;");
      expect(instructionsHtml).not.toContain("&amp;amp;");
      expect(instructionsHtml).not.toContain("&amp;quot;");
      expect(convertBlockHtmlToMarkdown(instructionsHtml, pipeline)).toBe(
        instructions
      );
    }
  });

  it("fails without applying anything when one target is gone", () => {
    const html = convertMarkdownToBlockHtml("Alpha\n\nBravo", pipeline);
    const [, alphaId] = blockIds(html);

    const result = applyInstructionEditsToHtml(
      html,
      [
        { targetBlockId: alphaId, content: "<p>Alpha edited</p>" },
        { targetBlockId: "gone12345", content: "<p>Never applied</p>" },
      ],
      pipeline
    );

    expect(result.isErr()).toBe(true);
  });
});
