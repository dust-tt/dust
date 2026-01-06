import { cn, markdownStyles } from "@dust-tt/sparkle";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useMemo } from "react";

import { SpacesProvider } from "@app/components/agent_builder/SpacesContext";
import { ListItemExtension } from "@app/components/editor/extensions/ListItemExtension";
import { OrderedListExtension } from "@app/components/editor/extensions/OrderedListExtension";
import { KnowledgeNode } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import type { LightWorkspaceType } from "@app/types";

interface SkillInstructionsReadOnlyEditorProps {
  content: string;
  owner: LightWorkspaceType;
}

export function SkillInstructionsReadOnlyEditor({
  content,
  owner,
}: SkillInstructionsReadOnlyEditorProps) {
  const extensions = useMemo(() => {
    return [
      Markdown,
      StarterKit.configure({
        orderedList: false,
        listItem: false,
        bulletList: {
          HTMLAttributes: {
            class: markdownStyles.unorderedList(),
          },
        },
        blockquote: false,
        horizontalRule: false,
        strike: false,
        code: {
          HTMLAttributes: {
            class: markdownStyles.codeBlock(),
          },
        },
        codeBlock: {
          HTMLAttributes: {
            class: markdownStyles.codeBlock(),
          },
        },
        paragraph: {
          HTMLAttributes: {
            class: markdownStyles.paragraph(),
          },
        },
      }),
      KnowledgeNode,
      OrderedListExtension.configure({
        HTMLAttributes: {
          class: markdownStyles.orderedList(),
        },
      }),
      ListItemExtension.configure({
        HTMLAttributes: {
          class: markdownStyles.list(),
        },
      }),
    ];
  }, []);

  const editor = useEditor(
    {
      extensions,
      content,
      contentType: "markdown",
      editable: false,
      immediatelyRender: false,
    },
    [extensions, content]
  );

  return (
    <SpacesProvider owner={owner}>
      <div
        className={cn(
          "min-h-60 w-full min-w-0 rounded-xl border p-3",
          "border-border bg-muted-background",
          "dark:border-border-night dark:bg-muted-background-night"
        )}
      >
        <EditorContent editor={editor} />
      </div>
    </SpacesProvider>
  );
}
