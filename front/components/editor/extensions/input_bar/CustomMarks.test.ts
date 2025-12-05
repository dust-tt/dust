import type { Editor } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CustomBold,
  CustomItalic,
} from "@app/components/editor/extensions/input_bar/CustomMarks";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";

describe("CustomBold", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory([CustomBold]);
  });

  afterEach(() => {
    editor.destroy();
  });

  it("should handle bold text", () => {
    editor.commands.setContent("**bold text**", {
      contentType: "markdown",
    });

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        content: [
          {
            marks: [
              {
                type: "bold",
              },
            ],
            text: "bold text",
            type: "text",
          },
        ],
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe("**bold text**");
  });

  it("should handle bold text with special characters", () => {
    editor.commands.setContent("**hello (world) - test!**", {
      contentType: "markdown",
    });

    const result = editor.getMarkdown();
    expect(result).toBe("**hello (world) - test!**");
  });

  it("should handle bold text in sentence", () => {
    editor.commands.setContent("This is **bold** text", {
      contentType: "markdown",
    });

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        content: [
          {
            text: "This is ",
            type: "text",
          },
          {
            marks: [
              {
                type: "bold",
              },
            ],
            text: "bold",
            type: "text",
          },
          {
            text: " text",
            type: "text",
          },
        ],
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe("This is **bold** text");
  });

  it("should parse bold with trailing space", () => {
    editor.commands.setContent("**hello **", {
      contentType: "markdown",
    });

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        content: [
          {
            marks: [
              {
                type: "bold",
              },
            ],
            text: "hello ",
            type: "text",
          },
        ],
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe("**hello **");
  });

  it("should parse bold with leading space", () => {
    editor.commands.setContent("** hello**", {
      contentType: "markdown",
    });

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        content: [
          {
            marks: [
              {
                type: "bold",
              },
            ],
            text: " hello",
            type: "text",
          },
        ],
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe("** hello**");
  });
});

describe("CustomItalic", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory([CustomItalic]);
  });

  afterEach(() => {
    editor.destroy();
  });

  it("should handle italic text", () => {
    editor.commands.setContent("_italic text_", {
      contentType: "markdown",
    });

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        content: [
          {
            marks: [
              {
                type: "italic",
              },
            ],
            text: "italic text",
            type: "text",
          },
        ],
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe("_italic text_");
  });

  it("should handle italic text with special characters", () => {
    editor.commands.setContent("_hello (world) - test!_", {
      contentType: "markdown",
    });

    const result = editor.getMarkdown();
    expect(result).toBe("_hello (world) - test!_");
  });

  it("should handle italic text in sentence", () => {
    editor.commands.setContent("This is _italic_ text", {
      contentType: "markdown",
    });

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        content: [
          {
            text: "This is ",
            type: "text",
          },
          {
            marks: [
              {
                type: "italic",
              },
            ],
            text: "italic",
            type: "text",
          },
          {
            text: " text",
            type: "text",
          },
        ],
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe("This is _italic_ text");
  });

  it("should parse italic with trailing space", () => {
    editor.commands.setContent("_hello _", {
      contentType: "markdown",
    });

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        content: [
          {
            marks: [
              {
                type: "italic",
              },
            ],
            text: "hello ",
            type: "text",
          },
        ],
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe("_hello _");
  });

  it("should parse italic with leading space", () => {
    editor.commands.setContent("_ hello_", {
      contentType: "markdown",
    });

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        content: [
          {
            marks: [
              {
                type: "italic",
              },
            ],
            text: " hello",
            type: "text",
          },
        ],
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe("_ hello_");
  });
});

describe("CustomBold", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory([CustomBold, CustomItalic]);
  });

  afterEach(() => {
    editor.destroy();
  });

  it("should parse bold with inner italic", () => {
    editor.commands.setContent("** _hello_**", {
      contentType: "markdown",
    });

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        content: [
          {
            marks: [
              {
                type: "bold",
              },
            ],
            text: " ",
            type: "text",
          },
          {
            marks: [
              {
                type: "bold",
              },
              {
                type: "italic",
              },
            ],
            text: "hello",
            type: "text",
          },
        ],
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe("** _hello**_");
  });

  it("should parse italic with inner bold", () => {
    editor.commands.setContent("_**hello** _", {
      contentType: "markdown",
    });

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        content: [
          {
            marks: [
              {
                type: "bold",
              },
              {
                type: "italic",
              },
            ],
            text: "hello",
            type: "text",
          },
          {
            marks: [
              {
                type: "italic",
              },
            ],
            text: " ",
            type: "text",
          },
        ],
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe("_**hello** _");
  });
});
