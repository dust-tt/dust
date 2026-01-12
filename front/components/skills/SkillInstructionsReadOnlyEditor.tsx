import { SpacesProvider } from "@app/components/agent_builder/SpacesContext";
import {
  SkillInstructionsEditorContent,
  useSkillInstructionsEditor,
} from "@app/components/editor/SkillInstructionsEditor";
import type { LightWorkspaceType } from "@app/types";

interface SkillInstructionsReadOnlyEditorProps {
  content: string;
  owner: LightWorkspaceType;
}

export function SkillInstructionsReadOnlyEditor({
  content,
  owner,
}: SkillInstructionsReadOnlyEditorProps) {
  const { editor } = useSkillInstructionsEditor({
    content,
    isReadOnly: true,
  });

  return (
    <SpacesProvider owner={owner}>
      <SkillInstructionsEditorContent editor={editor} isReadOnly />
    </SpacesProvider>
  );
}
