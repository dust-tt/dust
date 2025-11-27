import { Editor } from "@tiptap/core";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import type React from "react";

import { buildEditorExtensions } from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import type { WorkspaceType } from "@app/types";

/**
 * Renders markdown content to React elements using TipTap's static renderer.
 * This safely converts markdown to React without using dangerouslySetInnerHTML.
 */
export function renderMessageContent(
  markdown: string,
  owner: WorkspaceType
): React.ReactNode {
  const extensions = buildEditorExtensions({ owner });
  // Create a temporary editor instance to parse markdown
  const tempEditor = new Editor({
    extensions,
    editorProps: { attributes: { class: "hidden" } },
  });

  tempEditor.commands.setContent(markdown, { contentType: "markdown" });

  // Get the JSON representation
  const json = tempEditor.getJSON();

  tempEditor.destroy();

  // Convert JSON to React elements using TipTap's static renderer
  return renderToReactElement({ extensions, content: json });
}
