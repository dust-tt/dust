import { ToolNode } from "@app/components/editor/extensions/skill_builder/ToolNode";
import type { ToolNodeAttributes } from "@app/components/editor/extensions/skill_builder/ToolNodeTypes";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";
import {
  postProcessMarkdown,
  preprocessMarkdownForEditor,
} from "@app/lib/editor/skill_instructions_preprocessing";
import {
  extractToolTags,
  parseToolTag,
  serializeToolTag,
  stripToolTagPresentationAttributes,
} from "@app/lib/tools/format";
import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TOOL_ATTRS: ToolNodeAttributes = {
  mcpServerViewId: "mcp_server_view_123",
  toolIcon: "GithubLogo",
  toolName: "GitHub Search",
};

function toolNodes(editor: Editor) {
  const nodes: { attrs?: ToolNodeAttributes; type: string }[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "toolNode") {
      nodes.push({
        attrs: {
          mcpServerViewId: node.attrs.mcpServerViewId,
          toolIcon: node.attrs.toolIcon,
          toolName: node.attrs.toolName,
        },
        type: node.type.name,
      });
    }
  });
  return nodes;
}

describe("ToolNode tag helpers", () => {
  it("serializes and parses tool tags with XML escaping", () => {
    const attrs = {
      icon: "GithubLogo",
      id: "mcp_server_view_123",
      name: 'GitHub & "Issues" <Prod>',
    };

    const tag = serializeToolTag(attrs);

    expect(tag).toContain("GitHub &amp; &quot;Issues&quot; &lt;Prod&gt;");
    expect(parseToolTag(tag)).toEqual(attrs);
  });

  it("parses missing icon as null", () => {
    expect(
      parseToolTag('<tool id="mcp_server_view_123" name="GitHub Search" />')
    ).toEqual({
      icon: null,
      id: "mcp_server_view_123",
      name: "GitHub Search",
    });
  });

  it("rejects malformed tool tags", () => {
    expect(parseToolTag('<tool name="GitHub Search" />')).toBeNull();
    expect(parseToolTag('<tool id="mcp_server_view_123" />')).toBeNull();
    expect(
      parseToolTag(
        '<tool id="mcp_server_view_123" name="GitHub Search"></tool>'
      )
    ).toBeNull();
  });

  it("extracts valid tool tags from content", () => {
    expect(
      extractToolTags(
        'Use <tool id="mcp_server_view_1" name="A" /> and <tool id="mcp_server_view_2" name="B" icon="ToolsIcon" />.'
      )
    ).toEqual([
      {
        icon: null,
        id: "mcp_server_view_1",
        name: "A",
      },
      {
        icon: "ToolsIcon",
        id: "mcp_server_view_2",
        name: "B",
      },
    ]);
  });

  it("strips icon presentation attributes from tool tags", () => {
    expect(
      stripToolTagPresentationAttributes(
        '<tool id="mcp_server_view_123" name="GitHub Search" icon="GithubLogo" />'
      )
    ).toBe('<tool id="mcp_server_view_123" name="GitHub Search" />');

    expect(
      stripToolTagPresentationAttributes(
        '<tool id="mcp_server_view_123" name="GitHub Search" icon="GithubLogo"><span>GitHub Search</span></tool>'
      )
    ).toBe('<tool id="mcp_server_view_123" name="GitHub Search" />');
  });
});

describe("ToolNode", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory([ToolNode]);
  });

  afterEach(() => {
    editor.destroy();
  });

  it("round-trips markdown tool tags", () => {
    const markdown = `Use ${serializeToolTag({
      icon: TOOL_ATTRS.toolIcon,
      id: TOOL_ATTRS.mcpServerViewId,
      name: TOOL_ATTRS.toolName,
    })} now.`;

    editor.commands.setContent(preprocessMarkdownForEditor(markdown), {
      contentType: "markdown",
    });

    expect(toolNodes(editor)).toEqual([
      {
        attrs: TOOL_ATTRS,
        type: "toolNode",
      },
    ]);
    expect(editor.getMarkdown()).toContain(
      serializeToolTag({
        icon: TOOL_ATTRS.toolIcon,
        id: TOOL_ATTRS.mcpServerViewId,
        name: TOOL_ATTRS.toolName,
      })
    );
  });

  it("keeps malformed markdown tool tags as text", () => {
    const markdown =
      'Literal <tool name="GitHub Search">example</tool> and <tool id="mcp_server_view_123" />.';

    editor.commands.setContent(preprocessMarkdownForEditor(markdown), {
      contentType: "markdown",
    });

    expect(toolNodes(editor)).toEqual([]);
    expect(postProcessMarkdown(editor.getMarkdown())).toContain(markdown);
  });

  it("round-trips stored HTML tool tags", () => {
    editor.commands.setContent(
      '<p>Use <tool id="mcp_server_view_123" name="GitHub Search" icon="GithubLogo"></tool>.</p>'
    );

    expect(toolNodes(editor)).toEqual([
      {
        attrs: TOOL_ATTRS,
        type: "toolNode",
      },
    ]);
    expect(editor.getHTML()).toContain("<tool");
    expect(editor.getHTML()).toContain('id="mcp_server_view_123"');
    expect(editor.getHTML()).toContain('name="GitHub Search"');
    expect(editor.getHTML()).toContain('icon="GithubLogo"');
  });

  it("does not parse malformed stored HTML tool tags", () => {
    editor.commands.setContent(
      '<p>Literal <tool name="GitHub Search">example</tool>.</p>'
    );

    expect(toolNodes(editor)).toEqual([]);
    expect(editor.getText()).toContain("Literal example.");
  });

  it("inserts a tool node followed by a space", () => {
    editor.commands.insertToolNode(TOOL_ATTRS);

    expect(toolNodes(editor)).toEqual([
      {
        attrs: TOOL_ATTRS,
        type: "toolNode",
      },
    ]);
    expect(editor.getText()).toBe("/GitHub Search ");
  });
});
