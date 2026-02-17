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
  owner: LightWorkspaceType;
  onKnowledgeItemsChange?: (items: KnowledgeItem[]) => void;
}

export function SkillInstructionsReadOnlyEditor({
  content,
  owner,
  onKnowledgeItemsChange,
}: SkillInstructionsReadOnlyEditorProps) {
  const { editor, editorService } = useSkillInstructionsEditor({
    content,
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
      <SkillInstructionsEditorContent editor={editor} isReadOnly />
    </SpacesProvider>
  );
}
