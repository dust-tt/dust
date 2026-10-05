import { buildAgentInstructionsExtensionsForServer } from "@app/lib/editor/build_agent_instructions_extensions_server";
import type { Editor, JSONContent } from "@tiptap/core";
import { Editor as TiptapEditor } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("buildAgentInstructionsExtensionsForServer", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new TiptapEditor({
      extensions: buildAgentInstructionsExtensionsForServer(),
    });
  });

  afterEach(() => {
    editor.destroy();
  });

  // The schema is doc > instructionsRoot > blocks.
  function rootBlocks(e: Editor): JSONContent[] {
    return e.getJSON().content?.[0]?.content ?? [];
  }

  it("parses section tags in markdown as instruction blocks", () => {
    editor.commands.setContent(
      "<role>\n\nYou are a nice agent\n\n</role>\n\n<tools>\n\nYou have tools\n\n</tools>",
      { contentType: "markdown" }
    );

    const blocks = rootBlocks(editor);
    expect(blocks.map((b) => b.type)).toEqual([
      "instructionBlock",
      "instructionBlock",
    ]);
    expect(blocks.map((b) => b.attrs?.type)).toEqual(["role", "tools"]);
    expect(blocks[0].content?.[0]?.content?.[0]?.text).toBe(
      "You are a nice agent"
    );
  });

  it("serializes instruction blocks back to section tags", () => {
    editor.commands.setContent("<role>\n\nYou are a nice agent\n\n</role>", {
      contentType: "markdown",
    });

    expect(editor.getMarkdown()).toBe(
      "<role>\n\nYou are a nice agent\n\n</role>"
    );
  });

  it("reads instruction-block HTML as stored by the agent builder", () => {
    editor.commands.setContent(
      '<div data-type="instructions-root">' +
        '<div data-type="instruction-block" data-instruction-type="tools"><p>You have tools</p></div>' +
        "</div>"
    );

    const blocks = rootBlocks(editor);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("instructionBlock");
    expect(blocks[0].attrs?.type).toBe("tools");
    expect(editor.getMarkdown()).toBe("<tools>\n\nYou have tools\n\n</tools>");
  });
});
