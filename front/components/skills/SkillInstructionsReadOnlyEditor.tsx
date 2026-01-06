import { SpacesProvider } from "@app/components/agent_builder/SpacesContext";
import { SkillInstructionsEditor } from "@app/components/editor/SkillInstructionsEditor";
import type { LightWorkspaceType } from "@app/types";

interface SkillInstructionsReadOnlyEditorProps {
  content: string;
  owner: LightWorkspaceType;
}

export function SkillInstructionsReadOnlyEditor({
  content,
  owner,
}: SkillInstructionsReadOnlyEditorProps) {
  return (
    <SpacesProvider owner={owner}>
      <SkillInstructionsEditor content={content} isReadOnly />
    </SpacesProvider>
  );
}
