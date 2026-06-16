import { MCPServerDetails } from "@app/components/actions/mcp/MCPServerDetails";
import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { UserType, WorkspaceType } from "@app/types/user";

interface CapabilityDetailsSheetsProps {
  owner: WorkspaceType;
  user: UserType | null;
  selectedSkillId: string | null;
  selectedMCPServerView: MCPServerViewType | null;
  onCloseSkill: () => void;
  onCloseTool: () => void;
}

export function CapabilityDetailsSheets({
  owner,
  user,
  selectedSkillId,
  selectedMCPServerView,
  onCloseSkill,
  onCloseTool,
}: CapabilityDetailsSheetsProps) {
  const { skill } = useSkill({
    workspaceId: owner.sId,
    skillId: selectedSkillId,
    withRelations: true,
    disabled: !selectedSkillId,
  });

  return (
    <>
      {user && (
        <SkillDetailsSheet
          skill={skill ?? null}
          owner={owner}
          user={user}
          onClose={onCloseSkill}
        />
      )}

      <MCPServerDetails
        owner={owner}
        mcpServerView={selectedMCPServerView}
        isOpen={selectedMCPServerView !== null}
        onClose={onCloseTool}
        readOnly
      />
    </>
  );
}
