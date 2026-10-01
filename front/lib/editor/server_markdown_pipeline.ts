import type {
  InstructionsSchema,
  MarkdownPipeline,
} from "@app/lib/editor/skill_instructions_html";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Extensions } from "@tiptap/core";

// Server counterpart of `browser_markdown_pipeline`, backed by jsdom. Kept out of
// `skill_instructions_html` so browser bundles importing its helpers never reach jsdom.
//
// The editor schema, tiptap, prosemirror and cheerio are only needed once
// instructions are actually converted, and building the extension list runs
// every node definition. Resolved on first use so front-api does not pay for it
// at boot; the exported helpers are synchronous, hence require over import().

const markdownPipelines: Partial<Record<InstructionsSchema, MarkdownPipeline>> =
  {};

export function setMarkdownPipelineForTesting(
  pipeline: MarkdownPipeline,
  schema: InstructionsSchema = "skill"
): void {
  markdownPipelines[schema] = pipeline;
}

function buildExtensionsForServer(schema: InstructionsSchema): Extensions {
  switch (schema) {
    case "skill":
      return (
        require("@app/lib/editor/build_skill_instructions_extensions_server") as typeof import("@app/lib/editor/build_skill_instructions_extensions_server")
      ).buildSkillInstructionsExtensionsForServer();
    case "agent":
      return (
        require("@app/lib/editor/build_agent_instructions_extensions_server") as typeof import("@app/lib/editor/build_agent_instructions_extensions_server")
      ).buildAgentInstructionsExtensionsForServer();
    default:
      assertNever(schema);
  }
}

export function getMarkdownPipeline(
  schema: InstructionsSchema
): MarkdownPipeline {
  let markdownPipeline = markdownPipelines[schema];
  if (!markdownPipeline) {
    const { getSchema } =
      require("@tiptap/core") as typeof import("@tiptap/core");
    const { MarkdownManager } =
      require("@tiptap/markdown") as typeof import("@tiptap/markdown");
    const { DOMParser } =
      require("@tiptap/pm/model") as typeof import("@tiptap/pm/model");
    const { Transform } =
      require("@tiptap/pm/transform") as typeof import("@tiptap/pm/transform");
    const { JSDOM } = require("jsdom") as typeof import("jsdom");
    const extensions = buildExtensionsForServer(schema);

    markdownPipeline = {
      extensions,
      markdownManager: new MarkdownManager({ extensions }),
      renderToHTMLString: (
        require("@tiptap/static-renderer/pm/html-string") as typeof import("@tiptap/static-renderer/pm/html-string")
      ).renderToHTMLString,
      cheerio: require("cheerio") as typeof import("cheerio"),
      document: new JSDOM("").window.document,
      domParser: DOMParser.fromSchema(getSchema(extensions)),
      createTransform: (doc) => new Transform(doc),
    };
    markdownPipelines[schema] = markdownPipeline;
  }

  return markdownPipeline;
}
