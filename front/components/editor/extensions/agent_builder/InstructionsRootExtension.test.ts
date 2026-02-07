import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InstructionsDocumentExtension } from "@app/components/editor/extensions/agent_builder/InstructionsDocumentExtension";
import {
  INSTRUCTIONS_ROOT_DATA_TYPE,
  InstructionsRootExtension,
} from "@app/components/editor/extensions/agent_builder/InstructionsRootExtension";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";

describe("InstructionsRootExtension serialization", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory(
      [InstructionsDocumentExtension, InstructionsRootExtension],
      { starterKit: { document: false } }
    );
  });

  afterEach(() => {
    editor.destroy();
  });

  it("should serialize to markdown without wrapper tags", () => {
    editor.commands.setContent("Hello world", { contentType: "markdown" });

    const md = editor.getMarkdown();

    expect(md).toBe("Hello world");
  });

  it("should serialize to HTML with the instructions-root wrapper", () => {
    editor.commands.setContent("Hello world", { contentType: "markdown" });

    const html = editor.getHTML();

    expect(html).toContain(`data-type="${INSTRUCTIONS_ROOT_DATA_TYPE}"`);
    expect(html).toContain("<p>Hello world</p>");
  });

  it("should serialize multi-block content to markdown with blocks separated by newlines", () => {
    editor.commands.setContent(
      "# Heading\n\nFirst paragraph\n\nSecond paragraph",
      {
        contentType: "markdown",
      }
    );

    const md = editor.getMarkdown();

    expect(md).toBe("# Heading\n\nFirst paragraph\n\nSecond paragraph");
  });
});
