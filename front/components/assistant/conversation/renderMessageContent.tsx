import { Editor } from "@tiptap/core";
import { Markdown as MarkdownExtension } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import type React from "react";

import { DataSourceLinkExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/DataSourceLinkExtension";
import { MarkdownStyleExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/MarkdownStyleExtension";
import { MentionExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/MentionExtension";
import { PastedAttachmentExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/PastedAttachmentExtension";
import type { WorkspaceType } from "@app/types";

/**
 * Renders markdown content to React elements using TipTap's static renderer.
 * This safely converts markdown to React without using dangerouslySetInnerHTML.
 */
export function renderMessageContent(
  markdown: string,
  owner: WorkspaceType
): React.ReactNode {
  // Configure extensions for static rendering
  const extensions = [
    StarterKit.configure({
      hardBreak: false,
      strike: false,
    }),
    MarkdownStyleExtension,
    MarkdownExtension,
    DataSourceLinkExtension,
    MentionExtension.configure({
      owner,
      HTMLAttributes: {
        class:
          "min-w-0 px-0 py-0 border-none outline-none focus:outline-none focus:border-none ring-0 focus:ring-0 text-highlight-500 font-semibold",
      },
    }),
    PastedAttachmentExtension,
  ];

  // Create a temporary editor instance to parse markdown
  const tempEditor = new Editor({
    extensions,
    editorProps: {
      attributes: {
        class: "hidden",
      },
    },
  });

  // Set markdown content with explicit content type
  tempEditor.commands.setContent(markdown, { contentType: "markdown" });

  // Get the JSON representation
  const json = tempEditor.getJSON();

  // Destroy the temporary editor
  tempEditor.destroy();

  // Convert JSON to React elements using TipTap's static renderer
  return renderToReactElement({
    extensions,
    content: json,
  });
}
