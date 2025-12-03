import type { Editor } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DataSourceLinkExtension } from "@app/components/editor/extensions/input_bar/DataSourceLinkExtension";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";

describe("DataSourceLinkExtension", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory([DataSourceLinkExtension]);
  });

  afterEach(() => {
    editor.destroy();
  });

  it("should handle data source link", () => {
    editor.commands.setContent(
      ":content_node_mention[Project Documentation]{url=https://example.com/docs}",
      {
        contentType: "markdown",
      }
    );

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        content: [
          {
            attrs: {
              nodeId: null,
              provider: null,
              spaceId: null,
              title: "Project Documentation",
              url: "https://example.com/docs",
            },
            type: "dataSourceLink",
          },
        ],
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe(":content_node_mention[Project Documentation]");
  });

  it("should handle data source link with space and other characters", () => {
    editor.commands.setContent(
      ":content_node_mention[My Document (v2.0) - Final.pdf]{url=https://example.com/docs/My%20Document%20(v2.0)%20-%20Final.pdf}",
      {
        contentType: "markdown",
      }
    );

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        content: [
          {
            attrs: {
              nodeId: null,
              provider: null,
              spaceId: null,
              title: "My Document (v2.0) - Final.pdf",
              url: "https://example.com/docs/My%20Document%20(v2.0)%20-%20Final.pdf",
            },
            type: "dataSourceLink",
          },
        ],
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe(
      ":content_node_mention[My Document (v2.0) - Final.pdf]"
    );
  });

  it("should handle data source link of google docs", () => {
    editor.commands.setContent(
      ":content_node_mention[Goodies Stock]{url=https://docs.google.com/spreadsheets/d/1fiWXOaCHIVybS1ZD9ODeVt2EvNPyESwRZe0bET47-h0/edit?gid=0#gid=0}",
      {
        contentType: "markdown",
      }
    );

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        content: [
          {
            attrs: {
              nodeId: null,
              provider: null,
              spaceId: null,
              title: "Goodies Stock",
              url: "https://docs.google.com/spreadsheets/d/1fiWXOaCHIVybS1ZD9ODeVt2EvNPyESwRZe0bET47-h0/edit?gid=0#gid=0",
            },
            type: "dataSourceLink",
          },
        ],
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe(":content_node_mention[Goodies Stock]");
  });
});
