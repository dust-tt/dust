import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  appendMissingToolRefs,
  toolRefsFromMCPViews,
} from "@app/lib/skills/tool_references";
import type { ToolReference } from "@app/lib/tools/format";
import { describe, expect, it } from "vitest";

const GITHUB_TOOL: ToolReference = {
  icon: "GithubLogo",
  id: "mcp_server_view_123",
  name: "GitHub Search",
};

const SLACK_TOOL: ToolReference = {
  icon: null,
  id: "mcp_server_view_456",
  name: "Slack",
};

describe("appendMissingToolRefs", () => {
  it("appends missing tool references to markdown and stored HTML", () => {
    const result = appendMissingToolRefs({
      instructions: "Use this skill for repository lookups.",
      instructionsHtml:
        '<div data-type="instructions-root" data-block-id="instructions-root"><p data-block-id="existing1">Use this skill for repository lookups.</p></div>',
      tools: [GITHUB_TOOL],
    });

    expect(result.instructions).toBe(
      'Use this skill for repository lookups.\n\nEnabled tools: <tool id="mcp_server_view_123" name="GitHub Search" icon="GithubLogo" />'
    );
    expect(result.instructionsHtml).toContain(
      '<p data-block-id="existing1">Use this skill for repository lookups.</p>'
    );
    expect(result.instructionsHtml).toContain("Enabled tools:");
    expect(result.instructionsHtml).toContain(
      '<tool id="mcp_server_view_123" name="GitHub Search" icon="GithubLogo"></tool>'
    );
  });

  it("does not duplicate tools already referenced in markdown or HTML", () => {
    const result = appendMissingToolRefs({
      instructions: `Use ${GITHUB_TOOL.name}.\n\nEnabled tools: <tool id="${GITHUB_TOOL.id}" name="${GITHUB_TOOL.name}" />`,
      instructionsHtml: `<div data-type="instructions-root" data-block-id="instructions-root"><p>Use GitHub.</p><p>Enabled tools: <tool id="${GITHUB_TOOL.id}" name="${GITHUB_TOOL.name}"></tool></p></div>`,
      tools: [GITHUB_TOOL, SLACK_TOOL],
    });

    expect(result.instructions.match(/mcp_server_view_123/g)).toHaveLength(1);
    expect(result.instructions.match(/mcp_server_view_456/g)).toHaveLength(1);
    expect(result.instructionsHtml?.match(/mcp_server_view_123/g)).toHaveLength(
      1
    );
    expect(result.instructionsHtml?.match(/mcp_server_view_456/g)).toHaveLength(
      1
    );
  });

  it("keeps content unchanged when every tool is already referenced", () => {
    const instructions = `Enabled tools: <tool id="${GITHUB_TOOL.id}" name="${GITHUB_TOOL.name}" />`;
    const instructionsHtml = `<p>Enabled tools: <tool id="${GITHUB_TOOL.id}" name="${GITHUB_TOOL.name}"></tool></p>`;

    expect(
      appendMissingToolRefs({
        instructions,
        instructionsHtml,
        tools: [GITHUB_TOOL],
      })
    ).toEqual({
      instructions,
      instructionsHtml,
    });
  });
});

describe("toolRefsFromMCPViews", () => {
  it("uses the view display name and server icon", () => {
    const viewType: MCPServerViewType = {
      createdAt: 0,
      description: null,
      editedByUser: null,
      id: 123,
      name: "github_search",
      oAuthUseCase: null,
      sId: "mcp_server_view_123",
      server: {
        allowMultipleInstances: true,
        authorization: null,
        availability: "manual",
        description: "Search GitHub",
        documentationUrl: null,
        icon: "GithubLogo",
        name: "github",
        sId: "remote_mcp_server_123",
        tools: [],
        version: "1.0.0",
      },
      serverType: "remote",
      spaceId: "space_123",
      updatedAt: 0,
    };
    const view = {
      sId: "mcp_server_view_123",
      toJSON: () => viewType,
    };

    expect(toolRefsFromMCPViews([view])).toEqual([
      {
        icon: "GithubLogo",
        id: "mcp_server_view_123",
        name: "GitHub Search",
      },
    ]);
  });
});
