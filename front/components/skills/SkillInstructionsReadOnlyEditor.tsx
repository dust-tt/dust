import { SpacesProvider } from "@app/components/agent_builder/SpacesContext";
import type { KnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";
import {
  SkillInstructionsEditorContent,
  useSkillInstructionsEditor,
} from "@app/components/editor/SkillInstructionsEditor";
import type { LightWorkspaceType } from "@app/types/user";
import { useEffect } from "react";

interface SkillInstructionsReadOnlyEditorProps {
  content: string;
  htmlContent?: string;
  owner: LightWorkspaceType;
  onKnowledgeItemsChange?: (items: KnowledgeItem[]) => void;
  className?: string;
}

export function SkillInstructionsReadOnlyEditor({
  content,
  htmlContent,
  owner,
  onKnowledgeItemsChange,
  className,
}: SkillInstructionsReadOnlyEditorProps) {
  const htmlForEditor =
    htmlContent && htmlContent.trim() !== "" ? htmlContent : undefined;

  const { editor, editorService } = useSkillInstructionsEditor({
    content,
    htmlContent: htmlForEditor,
    withDocumentExtensions: Boolean(htmlForEditor),
    isReadOnly: true,
  });

  useEffect(() => {
    if (!editor || !onKnowledgeItemsChange) {
      return;
    }

    const updateItems = () => {
      const items = editorService.getKnowledgeItems();
      onKnowledgeItemsChange(items);
    };

    updateItems();
    editor.on("update", updateItems);

    return () => {
      editor.off("update", updateItems);
    };
  }, [editor, editorService, onKnowledgeItemsChange]);

  return (
    <SpacesProvider owner={owner}>
      <SkillInstructionsEditorContent
        editor={editor}
        isReadOnly
        className={className}
      />
    </SpacesProvider>
  );
}
