import { buildSkillInstructionsExtensionsForServer } from "@app/lib/editor/build_skill_instructions_extensions_server";
import type { MarkdownPipeline } from "@app/lib/editor/skill_instructions_html";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { DOMParser } from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";
import { renderToHTMLString } from "@tiptap/static-renderer/pm/html-string";
import * as cheerio from "cheerio";

let browserMarkdownPipeline: MarkdownPipeline | undefined;

export function getBrowserMarkdownPipeline(): MarkdownPipeline {
  if (!browserMarkdownPipeline) {
    const extensions = buildSkillInstructionsExtensionsForServer();

    browserMarkdownPipeline = {
      extensions,
      markdownManager: new MarkdownManager({ extensions }),
      renderToHTMLString,
      cheerio,
      document: window.document,
      domParser: DOMParser.fromSchema(getSchema(extensions)),
      createTransform: (doc) => new Transform(doc),
    };
  }

  return browserMarkdownPipeline;
}
