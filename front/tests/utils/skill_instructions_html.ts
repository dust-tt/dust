import { buildAgentInstructionsExtensionsForServer } from "@app/lib/editor/build_agent_instructions_extensions_server";
import { buildSkillInstructionsExtensionsForServer } from "@app/lib/editor/build_skill_instructions_extensions_server";
import type { InstructionsSchema } from "@app/lib/editor/skill_instructions_html";
import { setMarkdownPipelineForTesting } from "@app/lib/editor/skill_instructions_html";
import type { Extensions } from "@tiptap/core";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { DOMParser } from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";
import { renderToHTMLString } from "@tiptap/static-renderer/pm/html-string";
import * as cheerio from "cheerio";
import { JSDOM } from "jsdom";

function setupPipeline(schema: InstructionsSchema, extensions: Extensions) {
  setMarkdownPipelineForTesting(
    {
      extensions,
      markdownManager: new MarkdownManager({ extensions }),
      renderToHTMLString,
      cheerio,
      document: new JSDOM("").window.document,
      domParser: DOMParser.fromSchema(getSchema(extensions)),
      createTransform: (doc) => new Transform(doc),
    },
    schema
  );
}

// Installs both the skill and the agent pipelines: the production module lazily `require`s the
// extension builders behind a path alias vitest cannot resolve.
export function setupSkillInstructionsMarkdownPipeline(): void {
  setupPipeline("skill", buildSkillInstructionsExtensionsForServer());
  setupPipeline("agent", buildAgentInstructionsExtensionsForServer());
}
