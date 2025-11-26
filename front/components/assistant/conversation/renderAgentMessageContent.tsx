import { Editor } from "@tiptap/core";
import { Markdown as MarkdownExtension } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import type React from "react";

import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { DataSourceLinkExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/DataSourceLinkExtension";
import { ImageExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/ImageExtension";
import { MarkdownStyleExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/MarkdownStyleExtension";
import { MentionExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/MentionExtension";
import { PastedAttachmentExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/PastedAttachmentExtension";
import { ToolSetupExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/ToolSetupExtension";
import { VisualizationExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/VisualizationExtension";
import { Img } from "@app/components/markdown/Image";
import { ToolSetupCard } from "@app/components/markdown/tool/ToolSetupCard";
import type { WorkspaceType } from "@app/types";

interface RenderAgentMessageContentOptions {
  markdown: string;
  owner: WorkspaceType;
  agentConfigurationId: string;
  conversationId: string;
  messageId: string;
}

/**
 * Renders agent message content to React elements using TipTap's static renderer.
 * This version includes support for agent-specific custom directives like
 * visualization, dustimg, and toolSetup.
 */
export function renderAgentMessageContent({
  markdown,
  owner,
  agentConfigurationId,
  conversationId,
  messageId,
}: RenderAgentMessageContentOptions): React.ReactNode {
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
    VisualizationExtension,
    ImageExtension,
    ToolSetupExtension,
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

  // Convert JSON to React elements with custom node renderers
  return renderToReactElement({
    extensions,
    content: json,
    options: {
      renderNode: {
        visualization: ({ node }) => {
          return (
            <VisualizationActionIframe
              key={`viz-${messageId}`}
              code={node.attrs.code}
              complete={node.attrs.complete}
              owner={owner}
              agentConfigurationId={agentConfigurationId}
              conversationId={conversationId}
              messageId={messageId}
            />
          );
        },
        dustimg: ({ node }) => {
          return (
            <Img
              key={`img-${node.attrs.src}`}
              src={node.attrs.src}
              alt={node.attrs.alt}
              owner={owner}
            />
          );
        },
        toolSetup: ({ node }) => {
          return (
            <ToolSetupCard
              key={`tool-${node.attrs.toolId}`}
              toolName={node.attrs.toolName}
              toolId={node.attrs.toolId}
              owner={owner}
            />
          );
        },
      },
    },
  });
}
