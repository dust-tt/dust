import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { generateShortBlockId } from "@app/lib/generate_short_block_id";
import {
  extractToolTags,
  parseToolTag,
  serializeToolTag,
  TOOL_TAG_NAME,
  type ToolReference,
} from "@app/lib/tools/format";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import * as cheerio from "cheerio";

const ENABLED_TOOLS_LABEL = "Enabled tools:";
const TOOL_ELEMENT_REGEX = /<tool\b([^>]*)>[\s\S]*?<\/tool>/g;

export function toolRefsFromMCPViews(
  views: { sId: string; toJSON(): MCPServerViewType }[]
): ToolReference[] {
  return views.map((view) => {
    const viewType = view.toJSON();

    return {
      icon: viewType.server.icon ?? null,
      id: view.sId,
      name: getMcpServerViewDisplayName(viewType),
    };
  });
}

function getMissingToolRefs(
  content: string | null,
  tools: ToolReference[]
): ToolReference[] {
  const referencedToolIds = new Set(
    extractToolRefs(content ?? "").map((tool) => tool.id)
  );

  return tools.filter((tool) => !referencedToolIds.has(tool.id));
}

function extractToolRefs(content: string): ToolReference[] {
  const htmlToolRefs = [...content.matchAll(TOOL_ELEMENT_REGEX)]
    .map((match) => parseToolTag(`<${TOOL_TAG_NAME}${match[1].trimEnd()} />`))
    .filter((tool): tool is ToolReference => tool !== null);

  return [...extractToolTags(content), ...htmlToolRefs];
}

function renderMarkdownTools(tools: ToolReference[]): string {
  return tools.map((tool) => serializeToolTag(tool)).join(" ");
}

function renderHtmlTools(tools: ToolReference[]): string {
  return tools.map(renderHtmlTool).join(" ");
}

function renderHtmlTool(tool: ToolReference): string {
  return serializeToolTag(tool).replace(/\s\/>$/, `></${TOOL_TAG_NAME}>`);
}

function appendToolsToMarkdown(
  instructions: string,
  tools: ToolReference[]
): string {
  if (tools.length === 0) {
    return instructions;
  }

  return `${instructions.trimEnd()}\n\n${ENABLED_TOOLS_LABEL} ${renderMarkdownTools(tools)}`;
}

function appendToolsToHtml(
  instructionsHtml: string | null,
  tools: ToolReference[]
): string | null {
  if (instructionsHtml === null || tools.length === 0) {
    return instructionsHtml;
  }

  const paragraph = `<p data-block-id="${generateShortBlockId()}">${ENABLED_TOOLS_LABEL} ${renderHtmlTools(tools)}</p>`;
  const $ = cheerio.load(instructionsHtml, { xmlMode: false }, false);
  const root = $(
    `[data-block-id="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"]`
  ).first();

  if (root.length > 0) {
    root.append(paragraph);
    return $.html();
  }

  return `${instructionsHtml.trimEnd()}\n${paragraph}`;
}

export function appendMissingToolRefs({
  instructions,
  instructionsHtml,
  tools,
}: {
  instructions: string;
  instructionsHtml: string | null;
  tools: ToolReference[];
}): { instructions: string; instructionsHtml: string | null } {
  const missingInInstructions = getMissingToolRefs(instructions, tools);
  const nextInstructions = appendToolsToMarkdown(
    instructions,
    missingInInstructions
  );

  const missingInHtml = getMissingToolRefs(instructionsHtml, tools);
  const nextInstructionsHtml = appendToolsToHtml(
    instructionsHtml,
    missingInHtml
  );

  return {
    instructions: nextInstructions,
    instructionsHtml: nextInstructionsHtml,
  };
}
