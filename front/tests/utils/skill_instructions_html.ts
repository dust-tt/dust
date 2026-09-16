import { buildSkillInstructionsExtensionsForServer } from "@app/lib/editor/build_skill_instructions_extensions_server";
import { setMarkdownPipelineForTesting } from "@app/lib/reinforcement/skill_instructions_html";
import { MarkdownManager } from "@tiptap/markdown";
import { renderToHTMLString } from "@tiptap/static-renderer/pm/html-string";
import * as cheerio from "cheerio";

export function setupSkillInstructionsMarkdownPipeline(): void {
  const extensions = buildSkillInstructionsExtensionsForServer();
  setMarkdownPipelineForTesting({
    extensions,
    markdownManager: new MarkdownManager({ extensions }),
    renderToHTMLString,
    cheerio,
  });
}
