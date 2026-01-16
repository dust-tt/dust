import { useEffect } from "react";

import { SpacesProvider } from "@app/components/agent_builder/SpacesContext";
import type { KnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import {
  SkillInstructionsEditorContent,
  useSkillInstructionsEditor,
} from "@app/components/editor/SkillInstructionsEditor";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { LightWorkspaceType } from "@app/types";

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
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
  const useCustomMarkdown = hasFeature("custom_markdown_implementation");

  const { editor, editorService } = useSkillInstructionsEditor({
    content,
    isReadOnly: true,
    useCustomMarkdown,
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
